"""Observed DL-720W NEW ISSC BLE transport for explicitly approved TSPL jobs.

One CLI invocation opens one BLE session. There are no automatic retries.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import re

from bleak import BleakClient, BleakScanner


SERVICE_UUID = "49535343-fe7d-4ae5-8fa9-9fafd205e455"
RX_UUID = "49535343-8841-43f4-a8d4-ecbe34729bb3"
TX_UUID = "49535343-1e4d-4bd9-ba61-23c647249616"
CHUNK_BYTES = 20
CHUNK_DELAY_SECONDS = 0.020
PER_LABEL_TIMEOUT_SECONDS = 120
MAX_NOTIFY_EVENTS = 64
MAX_NOTIFY_BYTES = 4096
MAX_JOB_BYTES = 12056  # Largest physically verified one-label job.


def _validate_report_path(report_path: Path) -> Path:
    resolved = report_path.resolve()
    if resolved.suffix.casefold() != ".json":
        raise ValueError("report path must end in .json")
    if resolved.exists():
        raise ValueError("report already exists; use a new path for each print attempt")
    return resolved


async def _session(address: str, exact_name: str, jobs: list[bytes], approved_hash: str, report_path: Path) -> dict:
    report = {
        "started_at_utc": datetime.now(timezone.utc).isoformat(),
        "status": "no_job_bytes_sent",
        "physical_print_verified": False,
        "model": "DL-720W(NEW)",
        "target_address": "[redacted]",
        "service_uuid": SERVICE_UUID,
        "rx_uuid": RX_UUID,
        "tx_uuid": TX_UUID,
        "approved_job_sha256": approved_hash,
        "copies_requested": len(jobs),
        "copies_write_complete": 0,
        "chunk_bytes": CHUNK_BYTES,
        "chunks_attempted": 0,
        "chunks_acknowledged": 0,
        "bytes_attempted": 0,
        "bytes_acknowledged": 0,
        "notify_hex": [],
        "notify_truncated": False,
        "error_type": None,
        "note": "Link-layer write completion does not confirm a printed label. No automatic retry. If interrupted after any write attempt, physical outcome is unknown.",
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

    async def send_one(job: bytes):
        nonlocal started_write
        for offset in range(0, len(job), CHUNK_BYTES):
            chunk = job[offset:offset + CHUNK_BYTES]
            report["chunks_attempted"] += 1
            report["bytes_attempted"] += len(chunk)
            started_write = True
            await asyncio.wait_for(client.write_gatt_char(rx, chunk, response=True), timeout=10)
            report["chunks_acknowledged"] += 1
            report["bytes_acknowledged"] += len(chunk)
            await asyncio.sleep(CHUNK_DELAY_SECONDS)

    try:
        observations = await asyncio.wait_for(BleakScanner.discover(timeout=8, return_adv=True), timeout=10)
        matches = [device for device, advert in observations.values()
                   if device.address.casefold() == address.casefold()
                   and (advert.local_name or device.name or "") == exact_name]
        if len(matches) != 1:
            raise ValueError("exact observed printer address and name were not uniquely present")
        client = BleakClient(matches[0], timeout=10)
        await asyncio.wait_for(client.connect(), timeout=10)
        matching_services = [service for service in client.services if service.uuid.casefold() == SERVICE_UUID]
        if len(matching_services) != 1:
            raise ValueError("expected exactly one ISSC service")
        service = matching_services[0]
        rx_matches = [char for char in service.characteristics if char.uuid.casefold() == RX_UUID]
        tx_matches = [char for char in service.characteristics if char.uuid.casefold() == TX_UUID]
        if len(rx_matches) != 1 or len(tx_matches) != 1:
            raise ValueError("expected exactly one RX and one TX within ISSC service")
        rx, tx = rx_matches[0], tx_matches[0]
        if "write" not in rx.properties or "notify" not in tx.properties:
            raise ValueError("expected RX write and TX notify properties missing")
        await asyncio.wait_for(client.start_notify(tx, on_notify), timeout=10)
        for job in jobs:
            await asyncio.wait_for(send_one(job), timeout=PER_LABEL_TIMEOUT_SECONDS)
            report["copies_write_complete"] += 1
        report["status"] = "all_writes_acknowledged_physical_result_unverified"
        await asyncio.sleep(2)
    except asyncio.CancelledError:
        report["status"] = "outcome_unknown_after_write_attempt" if started_write else "no_job_bytes_sent"
        report["error_type"] = "TimeoutOrCancellation"
        raise
    except Exception as error:
        report["status"] = "outcome_unknown_after_write_attempt" if started_write else "no_job_bytes_sent"
        report["error_type"] = type(error).__name__
        raise
    finally:
        if client is not None and client.is_connected:
            try:
                await asyncio.wait_for(client.disconnect(), timeout=10)
            except Exception:
                report["disconnect_error"] = True
        report["ended_at_utc"] = datetime.now(timezone.utc).isoformat()
        report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def send_approved_job(*, address: str, target_name: str, job: bytes, approved_hash: str, copies: int, report_path: Path) -> dict:
    """Transmit only when the exact rendered job hash and printer identity match.

    This is a physical operation. The caller must already have user approval.
    """
    if not address.strip():
        raise ValueError("explicit target address required")
    if not re.fullmatch(r"DL-720W\(NEW\)[0-9A-Fa-f]{4}", target_name):
        raise ValueError("exact advertised DL-720W(NEW) target name with four-character suffix required")
    if copies not in (1, 2):
        raise ValueError("copies must be 1 or 2")
    if not 1 <= len(job) <= MAX_JOB_BYTES:
        raise ValueError("TSPL job exceeds the 12,056-byte verified single-label ceiling")
    digest = sha256(job).hexdigest()
    if len(approved_hash) != 64 or approved_hash.casefold() != digest:
        raise ValueError("approved SHA-256 does not match the rendered TSPL job")
    if not job.startswith(b"SIZE ") or b"\r\nCLS\r\nBITMAP 0,0," not in job[:100] or not job.endswith(b"\r\nPRINT 1,1\r\n"):
        raise ValueError("unexpected TSPL job structure")
    path = _validate_report_path(report_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as reserved:
        reserved.write('{"status":"experiment_reserved_outcome_unknown_until_final_report"}\n')
    jobs = [job] * copies
    return asyncio.run(asyncio.wait_for(
        _session(address, target_name, jobs, digest, path),
        timeout=PER_LABEL_TIMEOUT_SECONDS * copies + 30,
    ))
