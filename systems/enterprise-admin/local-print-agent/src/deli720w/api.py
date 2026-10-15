"""Token-authenticated localhost adapter for the verified DL-720W NEW CLI path.

No listener or printer operation starts on import. Printing is disabled unless
the operator explicitly starts ``serve --enable-printing``.
"""

from __future__ import annotations

import argparse
import base64
from dataclasses import dataclass, field
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hmac
from io import BytesIO
import json
from pathlib import Path
import queue
import re
import secrets
import threading
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

from .raster import Label, render
from .medicine_label import MedicineIdentity, render_medicine_label
from .tspl import serialize
from .transport import MAX_JOB_BYTES, send_approved_job


MAX_BODY_BYTES = 16_384
MAX_QUEUE_JOBS = 8
IDEMPOTENCY = re.compile(r"[A-Za-z0-9_-]{16,128}\Z")
TARGET_NAME = re.compile(r"DL-720W\(NEW\)[0-9A-Fa-f]{4}\Z")
ALLOWED_PRINT_FIELDS = frozenset({
    "width_mm", "height_mm", "text", "qr", "code128", "trim_blank_bottom",
    "send", "copies", "approved_sha256", "idempotency_key", "medicine",
})


def _json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")


def _load_token(path: Path) -> str:
    token = path.read_text(encoding="ascii").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{32,128}", token):
        raise ValueError("token file must contain one 32–128 character URL-safe token")
    return token


def init_token_file(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="ascii") as file:
        file.write(secrets.token_urlsafe(32) + "\n")


def _parse_print_request(payload: object) -> tuple[bytes, dict, bool, int, str | None, str | None]:
    if not isinstance(payload, dict) or set(payload) - ALLOWED_PRINT_FIELDS:
        raise ValueError("request must be an object with supported print fields only")
    for key in ("width_mm", "height_mm"):
        if type(payload.get(key)) not in (int, float):
            raise ValueError(f"{key} must be a finite number")
    lines = payload.get("text", [])
    if not isinstance(lines, list) or any(not isinstance(line, str) for line in lines):
        raise ValueError("text must be an array of strings")
    for key in ("qr", "code128"):
        if payload.get(key) is not None and not isinstance(payload[key], str):
            raise ValueError(f"{key} must be a string")
    trim = payload.get("trim_blank_bottom", False)
    send = payload.get("send", False)
    copies = payload.get("copies", 1)
    if type(trim) is not bool or type(send) is not bool or type(copies) is not int or copies not in (1, 2):
        raise ValueError("trim_blank_bottom/send must be booleans and copies must be 1 or 2")
    if "medicine" in payload:
        if any(key in payload for key in ("text", "qr", "code128")):
            raise ValueError("medicine layout cannot mix with free text or symbols")
        if payload["width_mm"] != 50 or payload["height_mm"] != 30:
            raise ValueError("medicine layout requires physical 50 x 30 mm stock")
        identity = MedicineIdentity.from_payload(payload["medicine"])
        preview_image, physical_image = render_medicine_label(identity)
        label = Label(50, 30, 203, (identity.name,))
        job, metadata = serialize(label, image=physical_image, trim_blank_bottom=trim)
        metadata["layout"] = "medicine-landscape-v8"
    else:
        label = Label(float(payload["width_mm"]), float(payload["height_mm"]), 203,
                      tuple(lines), payload.get("qr"), payload.get("code128"))
        preview_image = render(label)
        job, metadata = serialize(label, image=preview_image, trim_blank_bottom=trim)
        metadata["layout"] = "general-v1"
    preview = BytesIO()
    preview_image.save(preview, format="PNG")
    metadata["preview_png_base64"] = base64.b64encode(preview.getvalue()).decode("ascii")
    approved = payload.get("approved_sha256")
    key = payload.get("idempotency_key")
    if approved is not None and not isinstance(approved, str):
        raise ValueError("approved_sha256 must be a string")
    if key is not None and not isinstance(key, str):
        raise ValueError("idempotency_key must be a string")
    return job, metadata, send, copies, approved, key


@dataclass
class ApiState:
    token: str
    port: int
    report_dir: Path
    printing_enabled: bool = False
    target_address: str | None = None
    target_name: str | None = None
    allowed_origins: frozenset[str] = frozenset()
    jobs: queue.Queue = field(default_factory=lambda: queue.Queue(maxsize=MAX_QUEUE_JOBS))
    lock: threading.Lock = field(default_factory=threading.Lock)
    receipts: dict[str, dict] = field(default_factory=dict)
    worker: threading.Thread | None = None

    def __post_init__(self) -> None:
        if not 1 <= self.port <= 65535:
            raise ValueError("port must be 1–65535")
        if self.printing_enabled and (not self.target_address or not self.target_name or not TARGET_NAME.fullmatch(self.target_name)):
            raise ValueError("printing requires exact target address and advertised DL-720W(NEW) name")
        for origin in self.allowed_origins:
            parsed = urlsplit(origin)
            if (parsed.scheme not in ("http", "https") or not parsed.hostname
                    or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment
                    or parsed.netloc != parsed.hostname + (f":{parsed.port}" if parsed.port else "")
                    or (parsed.scheme == "http" and parsed.hostname != "127.0.0.1")
                    or origin != f"{parsed.scheme}://{parsed.netloc}"):
                raise ValueError("allowed origins must be exact HTTPS origins or http://127.0.0.1:PORT")
        self.report_dir.mkdir(parents=True, exist_ok=True)

    def _receipt_path(self, key: str) -> Path:
        return self.report_dir / ("request-" + sha256(key.encode("ascii")).hexdigest() + ".json")

    def _save_receipt(self, key: str, receipt: dict, *, exclusive: bool = False) -> None:
        path = self._receipt_path(key)
        if exclusive:
            with path.open("xb") as file:
                file.write(_json_bytes(receipt))
        else:
            temporary = self.report_dir / (path.name + "." + uuid4().hex + ".tmp")
            temporary.write_bytes(_json_bytes(receipt))
            temporary.replace(path)

    def _read_receipt(self, key: str) -> dict | None:
        path = self._receipt_path(key)
        if not path.exists():
            return None
        result = json.loads(path.read_text(encoding="utf-8"))
        if result["status"] in ("queued", "printing") and key not in self.receipts:
            result = {**result, "status": "outcome_unknown_after_restart"}
        return result

    def recent_receipts(self) -> list[dict]:
        paths = sorted(self.report_dir.glob("request-*.json"), key=lambda path: path.stat().st_mtime, reverse=True)[:20]
        current_ids = {item["job_id"] for item in self.receipts.values()}
        older = []
        for path in paths:
            try:
                item = json.loads(path.read_text(encoding="utf-8"))
                if item["job_id"] not in current_ids:
                    if item["status"] in ("queued", "printing"):
                        item["status"] = "outcome_unknown_after_restart"
                    older.append(item)
            except (OSError, ValueError, KeyError):
                continue
        return list(self.receipts.values())[-20:] + older

    def submit(self, key: str, digest: str, copies: int, job: bytes) -> tuple[dict, bool]:
        fingerprint = sha256(f"{digest}:{copies}".encode("ascii")).hexdigest()
        with self.lock:
            existing = self.receipts.get(key) or self._read_receipt(key)
            if existing:
                if existing["request_fingerprint"] != fingerprint:
                    raise ValueError("idempotency key was already used for a different job or copy count")
                return existing.copy(), False
            if self.jobs.full():
                raise OverflowError("print queue is full")
            receipt = {
                "job_id": uuid4().hex,
                "status": "queued",
                "job_sha256": digest,
                "copies": copies,
                "request_fingerprint": fingerprint,
                "physical_print_verified": False,
            }
            self._save_receipt(key, receipt, exclusive=True)
            self.receipts[key] = receipt
            self.jobs.put_nowait((key, job, digest, copies))
            return receipt.copy(), True

    def _work(self) -> None:
        while True:
            key, job, digest, copies = self.jobs.get()
            try:
                with self.lock:
                    receipt = self.receipts[key]
                    receipt["status"] = "printing"
                    self._save_receipt(key, receipt)
            except Exception:
                # Never begin a physical send if the pre-send state cannot be
                # persisted. The durable reservation still prevents replay.
                with self.lock:
                    receipt["status"] = "failed_no_bytes_sent"
                    receipt["persistence_error"] = True
                self.jobs.task_done()
                continue
            report_path = self.report_dir / ("transmission-" + receipt["job_id"] + ".json")
            try:
                result = send_approved_job(address=self.target_address, target_name=self.target_name,
                                           job=job, approved_hash=digest, copies=copies,
                                           report_path=report_path)
                status = ("submitted_unverified" if result.get("copies_write_complete") == copies
                          else "outcome_unknown")
            except Exception:
                # If an interrupted write has no completed report, the physical
                # result cannot safely be called a clean failure or retried.
                try:
                    raw = json.loads(report_path.read_text(encoding="utf-8"))
                    status = ("failed_no_bytes_sent" if raw.get("status") == "no_job_bytes_sent"
                              and raw.get("bytes_attempted") == 0 else "outcome_unknown")
                except Exception:
                    status = "outcome_unknown"
            finally:
                with self.lock:
                    receipt["status"] = status
                    receipt["transmission_report"] = report_path.name if report_path.exists() else None
                    try:
                        self._save_receipt(key, receipt)
                    except Exception:
                        # Keep the in-memory result visible; after a restart,
                        # the last durable state is intentionally uncertain.
                        receipt["persistence_error"] = True
                self.jobs.task_done()

    def start_worker(self) -> None:
        if self.printing_enabled:
            self.worker = threading.Thread(target=self._work, name="deli720w-print-worker", daemon=True)
            self.worker.start()


def make_handler(state: ApiState) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        server_version = "Deli720WLocalAPI/1"

        def setup(self) -> None:
            super().setup()
            self.connection.settimeout(5)

        def _respond(self, status: int, value: dict) -> None:
            body = _json_bytes(value)
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            origin = self.headers.get("Origin")
            if origin in state.allowed_origins:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
            self.end_headers()
            self.wfile.write(body)

        def _authorized(self) -> bool:
            expected_host = f"127.0.0.1:{state.port}"
            if self.headers.get("Host") != expected_host:
                self._respond(403, {"error": "host rejected"})
                return False
            origin = self.headers.get("Origin")
            if origin is not None and origin not in state.allowed_origins:
                self._respond(403, {"error": "origin rejected"})
                return False
            supplied = self.headers.get("Authorization", "")
            try:
                supplied_bytes = supplied.encode("ascii")
            except UnicodeEncodeError:
                supplied_bytes = b""
            if not hmac.compare_digest(supplied_bytes, ("Bearer " + state.token).encode("ascii")):
                self._respond(401, {"error": "bearer token required"})
                return False
            return True

        def do_GET(self) -> None:
            if not self._authorized():
                return
            parsed = urlsplit(self.path)
            if parsed.path == "/printers" and not parsed.query:
                self._respond(200, {"printers": [{"model": "DL-720W(NEW)",
                    "configured": bool(state.target_address and state.target_name),
                    "printing_enabled": state.printing_enabled}], "discovery_performed": False})
                return
            if parsed.path == "/status":
                try:
                    query = parse_qs(parsed.query, strict_parsing=True) if parsed.query else {}
                except ValueError:
                    self._respond(400, {"error": "invalid query"})
                    return
                if set(query) - {"job_id"}:
                    self._respond(400, {"error": "unsupported query"})
                    return
                with state.lock:
                    receipts = state.recent_receipts()
                    selected = next((item.copy() for item in receipts if item["job_id"] == query.get("job_id", [None])[0]), None)
                    recent = [item.copy() for item in receipts[:20]]
                    depth = state.jobs.qsize()
                    worker_alive = state.worker.is_alive() if state.worker is not None else False
                if "job_id" in query:
                    self._respond(200 if selected else 404, {"job": selected} if selected else {"error": "unknown job"})
                else:
                    self._respond(200, {"queue_depth": depth, "worker_alive": worker_alive, "jobs": recent})
                return
            self._respond(404, {"error": "not found"})

        def do_POST(self) -> None:
            if not self._authorized():
                return
            if self.path != "/print":
                self._respond(404, {"error": "not found"})
                return
            if self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() != "application/json":
                self._respond(415, {"error": "application/json required"})
                return
            try:
                length = int(self.headers.get("Content-Length", ""))
                if not 1 <= length <= MAX_BODY_BYTES:
                    raise ValueError("request body must be 1–16384 bytes")
                payload = json.loads(self.rfile.read(length))
                job, metadata, send, copies, approved, key = _parse_print_request(payload)
                digest = sha256(job).hexdigest()
                if not send:
                    self._respond(200, {"status": "dry_run", "job_sha256": digest,
                        "job_bytes": len(job), "bitmap_height_dots": metadata["bitmap_height_dots"],
                        "copies": copies, "sent": False,
                        "preview_png_base64": metadata["preview_png_base64"],
                        "layout": metadata["layout"]})
                    return
                if not state.printing_enabled:
                    self._respond(403, {"error": "printing disabled at server startup"})
                    return
                if state.worker is not None and not state.worker.is_alive():
                    self._respond(503, {"error": "print worker stopped; restart operator service"})
                    return
                if len(job) > MAX_JOB_BYTES:
                    self._respond(400, {"error": "job exceeds the verified one-label byte ceiling"})
                    return
                if approved is None or not hmac.compare_digest(approved.casefold(), digest):
                    self._respond(409, {"error": "approved_sha256 must match this exact rendered job"})
                    return
                if key is None or not IDEMPOTENCY.fullmatch(key):
                    self._respond(400, {"error": "idempotency_key must be 16–128 URL-safe characters"})
                    return
                receipt, created = state.submit(key, digest, copies, job)
                self._respond(202 if created else 200, {"job": receipt,
                    "note": "Queued jobs can have an unknown physical outcome; never retry automatically."})
            except OverflowError as error:
                self._respond(429, {"error": str(error)})
            except (ValueError, TypeError, UnicodeError, RuntimeError) as error:
                self._respond(400, {"error": str(error)})

        def do_OPTIONS(self) -> None:
            # Browser preflight carries no bearer token and accesses no API data.
            # The subsequent GET/POST still requires the bearer token.
            if self.headers.get("Host") != f"127.0.0.1:{state.port}":
                self._respond(403, {"error": "host rejected"})
                return
            origin = self.headers.get("Origin")
            method = self.headers.get("Access-Control-Request-Method")
            headers = {part.strip().casefold() for part in self.headers.get("Access-Control-Request-Headers", "").split(",") if part.strip()}
            requested_path = urlsplit(self.path).path
            route_method = ((requested_path == "/print" and method == "POST")
                            or (requested_path in ("/status", "/printers") and method == "GET"))
            if (origin not in state.allowed_origins or not route_method
                    or "authorization" not in headers or not headers <= {"authorization", "content-type"}):
                self._respond(403, {"error": "preflight rejected"})
                return
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
            self.send_header("Access-Control-Max-Age", "0")
            self.send_header("Vary", "Origin")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def log_message(self, format: str, *args: object) -> None:
            # Do not log URLs or headers that may contain private label content.
            pass

    return Handler


def run_server(state: ApiState) -> None:
    state.start_worker()
    server = ThreadingHTTPServer(("127.0.0.1", state.port), make_handler(state))
    try:
        server.serve_forever(poll_interval=0.2)
    finally:
        server.server_close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m deli720w.api", description="Local token-authenticated DL-720W NEW API")
    sub = parser.add_subparsers(dest="command", required=True)
    init = sub.add_parser("init-token", help="create a fresh token file without printing it")
    init.add_argument("--token-file", required=True, type=Path)
    serve = sub.add_parser("serve", help="listen only on 127.0.0.1; printing disabled by default")
    serve.add_argument("--token-file", required=True, type=Path)
    serve.add_argument("--port", type=int, default=8765)
    serve.add_argument("--report-dir", type=Path, required=True)
    serve.add_argument("--enable-printing", action="store_true")
    serve.add_argument("--target-address")
    serve.add_argument("--target-name")
    serve.add_argument("--allow-origin", action="append", default=[])
    args = parser.parse_args(argv)
    try:
        if args.command == "init-token":
            init_token_file(args.token_file)
            print(f"Token created: {args.token_file.resolve()}")
            return 0
        token = _load_token(args.token_file)
        state = ApiState(token=token, port=args.port, report_dir=args.report_dir,
                         printing_enabled=args.enable_printing, target_address=args.target_address,
                         target_name=args.target_name, allowed_origins=frozenset(args.allow_origin))
        print(f"Listening on http://127.0.0.1:{state.port}; printing {'enabled' if state.printing_enabled else 'disabled'}")
        run_server(state)
        return 0
    except (OSError, ValueError) as error:
        print(f"Error: {error}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
