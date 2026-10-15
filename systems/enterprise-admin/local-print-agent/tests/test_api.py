"""Local HTTP tests. All physical printer operations are mocked or disabled."""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import asdict
import base64
import http.client
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import threading

import pytest

from deli720w import api
from deli720w.medicine_label import MedicineIdentity


TOKEN = "A" * 43
KEY = "same-request-123456789"
PRINT = {"width_mm": 30, "height_mm": 50, "text": ["TEST 123"], "trim_blank_bottom": True}


@contextmanager
def local_server(tmp_path: Path, *, printing: bool = False, monkeypatch=None):
    state = api.ApiState(token=TOKEN, port=8765, report_dir=tmp_path,
                         printing_enabled=printing,
                         target_address="AA:BB:CC:DD:EE:FF" if printing else None,
                         target_name="DL-720W(NEW)ABCD" if printing else None)
    server = ThreadingHTTPServer(("127.0.0.1", 0), api.make_handler(state))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield state, server.server_address[1]
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def request(port: int, method: str, path: str, payload=None, *, token=TOKEN, host="127.0.0.1:8765", origin=None,
            content_type="application/json", raw=None, preflight=False):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    body = raw if raw is not None else (json.dumps(payload).encode() if payload is not None else None)
    connection.putrequest(method, path, skip_host=True)
    connection.putheader("Host", host)
    if token is not None:
        connection.putheader("Authorization", "Bearer " + token)
    if origin is not None:
        connection.putheader("Origin", origin)
    if preflight:
        connection.putheader("Access-Control-Request-Method", "POST")
        connection.putheader("Access-Control-Request-Headers", "authorization, content-type")
    if body is not None:
        connection.putheader("Content-Type", content_type)
        connection.putheader("Content-Length", str(len(body)))
    connection.endheaders(body)
    response = connection.getresponse()
    content = response.read()
    result = response.status, json.loads(content) if content else {}
    connection.close()
    return result


def test_token_host_origin_gate_every_endpoint(tmp_path):
    with local_server(tmp_path) as (_, port):
        assert request(port, "GET", "/printers", token=None)[0] == 401
        assert request(port, "GET", "/status", token="bad")[0] == 401
        assert request(port, "GET", "/status", token="é")[0] == 401
        assert request(port, "POST", "/print", PRINT, host="evil.example")[0] == 403
        assert request(port, "GET", "/printers", origin="http://evil.example")[0] == 403
        assert request(port, "OPTIONS", "/print", token=None)[0] == 403
        assert request(port, "GET", "/printers")[1]["printers"][0]["printing_enabled"] is False
        assert request(port, "GET", "/status?bad-query")[0] == 400


def test_default_off_dry_run_hash_and_no_enqueue(tmp_path):
    with local_server(tmp_path) as (state, port):
        code, preview = request(port, "POST", "/print", PRINT)
        assert code == 200 and preview["status"] == "dry_run" and preview["sent"] is False
        assert len(preview["job_sha256"]) == 64
        assert base64.b64decode(preview["preview_png_base64"]).startswith(b"\x89PNG\r\n\x1a\n")
        attempted = {**PRINT, "send": True, "approved_sha256": preview["job_sha256"],
                     "idempotency_key": KEY}
        assert request(port, "POST", "/print", attempted)[0] == 403
        assert state.jobs.qsize() == 0
        assert not list(tmp_path.iterdir())


def test_medicine_preview_is_landscape_and_same_approved_job(tmp_path):
    identity = MedicineIdentity("安舒悅100毫克", "Aclonac", "Aceclofenac", "AC58623100", "衛署藥製字第058623號", "TEST-MED-001", "TEST-A01-02")
    payload = {"width_mm": 50, "height_mm": 30, "medicine": asdict(identity), "trim_blank_bottom": False}
    with local_server(tmp_path, printing=True) as (state, port):
        code, preview = request(port, "POST", "/print", payload)
        assert code == 200 and preview["layout"] == "medicine-landscape-v6"
        assert base64.b64decode(preview["preview_png_base64"]).startswith(b"\x89PNG\r\n\x1a\n")
        assert request(port, "POST", "/print", {**payload, "width_mm": 30})[0] == 400
        assert request(port, "POST", "/print", {**payload, "qr": "other"})[0] == 400
        code, result = request(port, "POST", "/print", {**payload, "send": True,
            "approved_sha256": preview["job_sha256"], "idempotency_key": "medicine-label-request-001"})
        assert code == 202 and result["job"]["job_sha256"] == preview["job_sha256"]
        assert state.jobs.qsize() == 1


def test_exact_hash_idempotency_and_conflict_before_queue(tmp_path):
    with local_server(tmp_path, printing=True) as (state, port):
        digest = request(port, "POST", "/print", PRINT)[1]["job_sha256"]
        payload = {**PRINT, "send": True, "approved_sha256": digest, "idempotency_key": KEY}
        assert request(port, "POST", "/print", {**payload, "approved_sha256": "0" * 64})[0] == 409
        assert request(port, "POST", "/print", {**payload, "idempotency_key": "short"})[0] == 400
        code, first = request(port, "POST", "/print", payload)
        assert code == 202 and first["job"]["status"] == "queued"
        code, second = request(port, "POST", "/print", payload)
        assert code == 200 and second["job"]["job_id"] == first["job"]["job_id"]
        assert state.jobs.qsize() == 1
        assert request(port, "POST", "/print", {**payload, "copies": 2})[0] == 400
        assert request(port, "GET", "/status?job_id=" + first["job"]["job_id"])[1]["job"]["status"] == "queued"


def test_approved_symbol_job_queues_once_without_hardware_send(tmp_path):
    with local_server(tmp_path, printing=True) as (state, port):
        symbol = {"width_mm": 30, "height_mm": 50, "qr": "DELI-720W-NEW",
                  "trim_blank_bottom": True}
        code, preview = request(port, "POST", "/print", symbol)
        assert code == 200 and preview["status"] == "dry_run"
        code, _ = request(port, "POST", "/print", {**symbol, "send": True,
            "approved_sha256": preview["job_sha256"], "idempotency_key": "symbol-request-123456"})
        assert code == 202 and state.jobs.qsize() == 1


def test_body_format_and_size_limits(tmp_path):
    with local_server(tmp_path) as (state, port):
        assert request(port, "POST", "/print", raw=b"{" + b" " * api.MAX_BODY_BYTES)[0] == 400
        assert request(port, "POST", "/print", PRINT, content_type="text/plain")[0] == 415
        assert request(port, "POST", "/print", {**PRINT, "unexpected": "x"})[0] == 400
        assert request(port, "POST", "/print", {**PRINT, "text": ["x"] * 4})[0] == 400
        assert state.jobs.qsize() == 0


def test_mock_worker_submitted_unverified_and_no_retry(tmp_path, monkeypatch):
    calls = []

    def fake_send(**kwargs):
        calls.append(kwargs)
        return {"copies_write_complete": kwargs["copies"]}

    monkeypatch.setattr(api, "send_approved_job", fake_send)
    state = api.ApiState(token=TOKEN, port=8765, report_dir=tmp_path,
                         printing_enabled=True, target_address="AA:BB:CC:DD:EE:FF",
                         target_name="DL-720W(NEW)ABCD")
    state.start_worker()
    job, _, _, _, _, _ = api._parse_print_request(PRINT)
    digest = api.sha256(job).hexdigest()
    receipt, created = state.submit(KEY, digest, 2, job)
    assert created
    state.jobs.join()
    assert len(calls) == 1 and calls[0]["copies"] == 2
    again, created = state.submit(KEY, digest, 2, job)
    assert not created and again["status"] == "submitted_unverified"
    assert again["physical_print_verified"] is False
    assert state.jobs.qsize() == 0


def test_restart_reservation_never_requeues(tmp_path):
    first = api.ApiState(token=TOKEN, port=8765, report_dir=tmp_path,
                         printing_enabled=True, target_address="AA:BB:CC:DD:EE:FF",
                         target_name="DL-720W(NEW)ABCD")
    job, _, _, _, _, _ = api._parse_print_request(PRINT)
    digest = api.sha256(job).hexdigest()
    receipt, _ = first.submit(KEY, digest, 1, job)
    restarted = api.ApiState(token=TOKEN, port=8765, report_dir=tmp_path,
                             printing_enabled=True, target_address="AA:BB:CC:DD:EE:FF",
                             target_name="DL-720W(NEW)ABCD")
    resumed, created = restarted.submit(KEY, digest, 1, job)
    assert not created and resumed["job_id"] == receipt["job_id"]
    assert resumed["status"] == "outcome_unknown_after_restart"
    assert restarted.jobs.qsize() == 0


def test_worker_persistence_failure_cannot_send(tmp_path, monkeypatch):
    state = api.ApiState(token=TOKEN, port=8765, report_dir=tmp_path,
                         printing_enabled=True, target_address="AA:BB:CC:DD:EE:FF",
                         target_name="DL-720W(NEW)ABCD")
    job, _, _, _, _, _ = api._parse_print_request(PRINT)
    digest = api.sha256(job).hexdigest()
    state.submit(KEY, digest, 1, job)
    monkeypatch.setattr(state, "_save_receipt", lambda *args, **kwargs: (_ for _ in ()).throw(OSError("disk full")))
    monkeypatch.setattr(api, "send_approved_job", lambda **kwargs: pytest.fail("printer must not be called"))
    state.start_worker()
    state.jobs.join()
    assert state.receipts[KEY]["status"] == "failed_no_bytes_sent"
    assert state.receipts[KEY]["persistence_error"] is True


def test_token_file_and_origin_validation(tmp_path):
    path = tmp_path / "token.txt"
    api.init_token_file(path)
    assert len(api._load_token(path)) >= 32
    with pytest.raises(FileExistsError):
        api.init_token_file(path)
    with pytest.raises(ValueError):
        api.ApiState(token=TOKEN, port=8765, report_dir=tmp_path / "bad",
                     allowed_origins=frozenset({"http://127.0.0.1:abc"}))
    for rejected in ("http://example.com", "https://example.com/path", "https://example.com@evil.test"):
        with pytest.raises(ValueError):
            api.ApiState(token=TOKEN, port=8765, report_dir=tmp_path / "bad",
                         allowed_origins=frozenset({rejected}))
    api.ApiState(token=TOKEN, port=8765, report_dir=tmp_path / "deployed",
                 allowed_origins=frozenset({"https://pharmacy.example"}))


def test_exact_browser_preflight_has_no_data_access(tmp_path):
    state = api.ApiState(token=TOKEN, port=8765, report_dir=tmp_path,
                         allowed_origins=frozenset({"http://127.0.0.1:3000"}))
    server = ThreadingHTTPServer(("127.0.0.1", 0), api.make_handler(state))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        port = server.server_address[1]
        assert request(port, "OPTIONS", "/print", token=None,
                       origin="http://127.0.0.1:3000", preflight=True)[0] == 204
        assert request(port, "POST", "/print", PRINT, token=None,
                       origin="http://127.0.0.1:3000")[0] == 401
        assert request(port, "OPTIONS", "/print", token=None,
                       origin="http://127.0.0.1:3001", preflight=True)[0] == 403
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
