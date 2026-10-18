import asyncio
import json
from pathlib import Path
import sys
from types import SimpleNamespace

import pytest


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import experimental_ble_job as experiment  # noqa: E402


def test_preflight_requires_exact_hash_and_private_target(monkeypatch, tmp_path):
    monkeypatch.setattr(experiment, "WORK_ROOT", tmp_path)
    target_file = tmp_path / "target_name.txt"
    target_file.write_text("DL-720W(NEW)ABCD\n", encoding="utf-8")
    monkeypatch.setattr(experiment, "TARGET_NAME_FILE", target_file)
    report = tmp_path / "report.json"
    with pytest.raises(ValueError, match="experimental"):
        experiment.preflight(experimental=False, approval_hash=experiment.JOB_SHA256, target_address="AA", report_json=report)
    with pytest.raises(ValueError, match="sha256"):
        experiment.preflight(experimental=True, approval_hash="0" * 64, target_address="AA", report_json=report)
    job, name = experiment.preflight(experimental=True, approval_hash=experiment.JOB_SHA256, target_address="AA", report_json=report)
    assert len(job) == experiment.JOB_BYTES
    assert name == "DL-720W(NEW)ABCD"
    report.write_text("prior attempt", encoding="utf-8")
    with pytest.raises(ValueError, match="already exists"):
        experiment.preflight(experimental=True, approval_hash=experiment.JOB_SHA256, target_address="AA", report_json=report)
    with pytest.raises(ValueError, match="inside workspace work"):
        experiment.preflight(experimental=True, approval_hash=experiment.JOB_SHA256, target_address="AA", report_json=tmp_path.parent / "outside.json")


def _fake_ble(monkeypatch, *, fail_on_write=None, duplicate_service=False, duplicate_rx=False):
    calls = []
    target = SimpleNamespace(name="DL-720W(NEW)ABCD", address="AA")
    rx = SimpleNamespace(uuid=experiment.RX_UUID, properties=["write"])
    tx = SimpleNamespace(uuid=experiment.TX_UUID, properties=["notify"])

    async def discover(**kwargs):
        calls.append("scan")
        return {"target": (target, SimpleNamespace(local_name=target.name))}

    class Service:
        uuid = experiment.SERVICE_UUID
        characteristics = [rx, tx, rx] if duplicate_rx else [rx, tx]

    class Services:
        def __iter__(self):
            return iter([Service(), Service()] if duplicate_service else [Service()])

    class Client:
        def __init__(self, device, timeout):
            assert device is target
            self.services = Services()
            self.is_connected = False
            calls.append("create")

        async def connect(self):
            self.is_connected = True
            calls.append("connect")

        async def start_notify(self, characteristic, callback):
            assert characteristic is tx
            callback(tx, b"\x01\x02")
            calls.append("notify")

        async def write_gatt_char(self, characteristic, chunk, response):
            assert characteristic is rx and response is True and 1 <= len(chunk) <= 20
            calls.append(bytes(chunk))
            if fail_on_write is not None and sum(isinstance(c, bytes) for c in calls) == fail_on_write:
                raise RuntimeError("simulated write failure")

        async def disconnect(self):
            calls.append("disconnect")
            self.is_connected = False

    async def fast_sleep(_seconds):
        return None

    monkeypatch.setattr(experiment.BleakScanner, "discover", discover)
    monkeypatch.setattr(experiment, "BleakClient", Client)
    monkeypatch.setattr(experiment.asyncio, "sleep", fast_sleep)
    return calls


def test_exact_service_single_job_and_disconnect(monkeypatch, tmp_path):
    calls = _fake_ble(monkeypatch)
    job = experiment.JOB_PATH.read_bytes()
    report_path = tmp_path / "report.json"
    report = asyncio.run(experiment.perform("AA", "DL-720W(NEW)ABCD", report_path, job))
    writes = [call for call in calls if isinstance(call, bytes)]
    assert b"".join(writes) == job
    assert len(writes) == (len(job) + 19) // 20
    assert calls.count("scan") == calls.count("connect") == calls.count("notify") == calls.count("disconnect") == 1
    assert report["status"] == "writes_acknowledged_physical_result_unverified"
    assert report["bytes_attempted"] == len(job)
    assert report["physical_print_verified"] is False
    assert report["notify_hex"] == ["0102"]
    assert "AA" not in report_path.read_text(encoding="utf-8")


def test_partial_send_is_unknown_and_never_retried(monkeypatch, tmp_path):
    calls = _fake_ble(monkeypatch, fail_on_write=3)
    report_path = tmp_path / "report.json"
    with pytest.raises(RuntimeError, match="simulated"):
        asyncio.run(experiment.perform("AA", "DL-720W(NEW)ABCD", report_path, experiment.JOB_PATH.read_bytes()))
    writes = [call for call in calls if isinstance(call, bytes)]
    assert len(writes) == 3
    assert calls.count("disconnect") == 1
    report = json.loads(report_path.read_text(encoding="utf-8"))
    assert report["status"] == "outcome_unknown_partial_send"
    assert report["chunks_attempted"] == 3
    assert report["chunks_acknowledged"] == 2
    assert report["bytes_attempted"] == 60


@pytest.mark.parametrize("duplicate_service,duplicate_rx", [(True, False), (False, True)])
def test_duplicate_profile_fails_before_notify_or_write(monkeypatch, tmp_path, duplicate_service, duplicate_rx):
    calls = _fake_ble(monkeypatch, duplicate_service=duplicate_service, duplicate_rx=duplicate_rx)
    report_path = tmp_path / "report.json"
    with pytest.raises(ValueError, match="exactly one"):
        asyncio.run(experiment.perform("AA", "DL-720W(NEW)ABCD", report_path, experiment.JOB_PATH.read_bytes()))
    assert not any(isinstance(call, bytes) for call in calls)
    assert "notify" not in calls
    assert calls.count("disconnect") == 1
