"""Opt-in, single-job BLE experiment. NEVER run without explicit human approval.

Only the reviewed 30 x 50 mm English sample is accepted. The script is kept
separate from the fail-closed deli720w CLI. Link-layer write acceptance is not
proof that the printer interpreted TSPL or printed correctly.
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import re
import sys

from bleak import BleakClient, BleakScanner


SERVICE_UUID = "49535343-fe7d-4ae5-8fa9-9fafd205e455"
RX_UUID = "49535343-8841-43f4-a8d4-ecbe34729bb3"
TX_UUID = "49535343-1e4d-4bd9-ba61-23c647249616"
TARGET_MODEL = "DL-720W(NEW)"
JOB_SHA256 = "5a7a2a7b8ea004b42ddd752f0790daed840e04c9cf804446d3ffcfa3e8d434c6"
JOB_BYTES = 12056
CHUNK_BYTES = 20
CHUNK_DELAY_SECONDS = 0.020
GLOBAL_TIMEOUT_SECONDS = 90
MAX_NOTIFY_BYTES = 4096
MAX_NOTIFY_EVENTS = 64
WORK_ROOT = Path(__file__).resolve().parents[3] / "work"
TARGET_NAME_FILE = WORK_ROOT / "deli_target_name.txt"
JOB_PATH = Path(__file__).resolve().parents[1] / "samples" / "experimental-english-30x50.tspl.bin"


def preflight(*, experimental: bool, approval_hash: str, target_address: str, report_json: Path) -> tuple[bytes, str]:
    if not experimental:
        raise ValueError("--experimental is required")
    if approval_hash.casefold() != JOB_SHA256:
        raise ValueError("--approve-job-sha256 must exactly match the reviewed sample hash")
    if not target_address.strip():
        raise ValueError("--target-address is required")
    target_name = TARGET_NAME_FILE.read_text(encoding="utf-8").strip()
    if not re.fullmatch(r"DL-720W\(NEW\)[0-9A-Fa-f]{4}", target_name):
        raise ValueError("private target name is absent or does not match the exact observed model format")
    report_path = report_json.resolve()
    if not report_path.is_relative_to(WORK_ROOT.resolve()) or report_path.suffix.casefold() != ".json":
        raise ValueError("--report-json must be a .json file inside workspace work/")
    if report_path.exists():
        raise ValueError("experiment report already exists; choose a fresh path to prevent accidental rerun")
    job = JOB_PATH.read_bytes()
    if len(job) != JOB_BYTES or sha256(job).hexdigest() != JOB_SHA256:
        raise ValueError("reviewed sample file has changed; aborting before BLE")
    if not job.startswith(b"SIZE 30 mm,50 mm\r\nCLS\r\nBITMAP 0,0,30,400,0,") or not job.endswith(b"\r\nPRINT 1,1\r\n"):
        raise ValueError("reviewed sample structure does not match expected TSPL job")
    return job, target_name


async def perform(target_address: str, target_name: str, report_json: Path, job: bytes) -> dict:
    report = {
        "started_at_utc": datetime.now(timezone.utc).isoformat(),
        "status": "no_job_bytes_sent",
        "physical_print_verified": False,
        "target_model": TARGET_MODEL,
        "target_address": "[redacted]",
        "service_uuid": SERVICE_UUID,
        "rx_uuid": RX_UUID,
        "tx_uuid": TX_UUID,
        "job_sha256": JOB_SHA256,
        "job_bytes": len(job),
        "chunk_bytes": CHUNK_BYTES,
        "chunks_attempted": 0,
        "bytes_attempted": 0,
        "chunks_acknowledged": 0,
        "bytes_acknowledged": 0,
        "notify_hex": [],
        "notify_truncated": False,
        "error_type": None,
        "note": "One attempt only. A write acknowledgement is not proof of printing. Inspect the label and media feed. Any partial send has unknown outcome; do not retry automatically.",
    }
    client = None
    started_write = False
    notify_bytes = 0

    def on_notify(_sender, data):
        nonlocal notify_bytes
        payload = bytes(data)
        if len(report["notify_hex"]) >= MAX_NOTIFY_EVENTS or notify_bytes + len(payload) > MAX_NOTIFY_BYTES:
            report["notify_truncated"] = True
            return
        notify_bytes += len(payload)
        report["notify_hex"].append(payload.hex())

    try:
        observations = await asyncio.wait_for(BleakScanner.discover(timeout=8, return_adv=True), timeout=10)
        selected = None
        for device, advert in observations.values():
            name = advert.local_name or device.name or ""
            if device.address.casefold() == target_address.casefold() and name == target_name:
                selected = device
                break
        if selected is None:
            raise ValueError("exact printer address and advertised model name were not both observed")
        client = BleakClient(selected, timeout=10)
        await asyncio.wait_for(client.connect(), timeout=10)
        matching_services = [service for service in client.services if service.uuid.casefold() == SERVICE_UUID]
        if len(matching_services) != 1:
            raise ValueError("expected exactly one ISSC service")
        service = matching_services[0]
        rx_matches = [char for char in service.characteristics if char.uuid.casefold() == RX_UUID]
        tx_matches = [char for char in service.characteristics if char.uuid.casefold() == TX_UUID]
        if len(rx_matches) != 1 or len(tx_matches) != 1:
            raise ValueError("expected exactly one RX and one TX inside ISSC service")
        rx, tx = rx_matches[0], tx_matches[0]
        if "write" not in rx.properties or "notify" not in tx.properties:
            raise ValueError("expected service-qualified RX/TX properties missing")
        # Subscribing configures only TX's CCCD for this session. Raw responses
        # are bounded and saved locally; their application format is unknown.
        await asyncio.wait_for(client.start_notify(tx, on_notify), timeout=10)
        for offset in range(0, len(job), CHUNK_BYTES):
            chunk = job[offset:offset + CHUNK_BYTES]
            report["chunks_attempted"] += 1
            report["bytes_attempted"] += len(chunk)
            started_write = True
            await asyncio.wait_for(client.write_gatt_char(rx, chunk, response=True), timeout=10)
            report["chunks_acknowledged"] += 1
            report["bytes_acknowledged"] += len(chunk)
            await asyncio.sleep(CHUNK_DELAY_SECONDS)
        report["status"] = "writes_acknowledged_physical_result_unverified"
        await asyncio.sleep(2)
    except asyncio.CancelledError:
        report["status"] = "outcome_unknown_partial_send" if started_write else "no_job_bytes_sent"
        report["error_type"] = "TimeoutOrCancellation"
        raise
    except Exception as error:
        report["status"] = "outcome_unknown_partial_send" if started_write else "no_job_bytes_sent"
        report["error_type"] = type(error).__name__
        raise
    finally:
        if client is not None and client.is_connected:
            try:
                await asyncio.wait_for(client.disconnect(), timeout=10)
            except Exception:
                report["disconnect_error"] = True
        report["ended_at_utc"] = datetime.now(timezone.utc).isoformat()
        report_json.parent.mkdir(parents=True, exist_ok=True)
        report_json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Single reviewed TSPL BLE experiment; requires explicit approval")
    parser.add_argument("--experimental", action="store_true")
    parser.add_argument("--approve-job-sha256", required=True)
    parser.add_argument("--target-address", required=True)
    parser.add_argument("--report-json", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        job, target_name = preflight(experimental=args.experimental, approval_hash=args.approve_job_sha256,
                        target_address=args.target_address, report_json=args.report_json)
        args.report_json.parent.mkdir(parents=True, exist_ok=True)
        with args.report_json.open("x", encoding="utf-8") as reserved:
            reserved.write('{"status":"experiment_reserved_outcome_unknown_until_final_report"}\n')
        report = asyncio.run(asyncio.wait_for(perform(args.target_address, target_name, args.report_json, job), timeout=GLOBAL_TIMEOUT_SECONDS))
    except Exception as error:
        print(f"Experiment stopped ({type(error).__name__}). Any attempted job write has unknown physical outcome; inspect the local report and do not retry automatically.", file=sys.stderr)
        return 4
    print(f"Writes acknowledged; physical print result unverified. Local report: {args.report_json.resolve()}")
    return 0 if report["status"] == "writes_acknowledged_physical_result_unverified" else 4


if __name__ == "__main__":
    raise SystemExit(main())
