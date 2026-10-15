import json
from hashlib import sha256
from pathlib import Path
from types import SimpleNamespace

import pytest
from PIL import Image

from deli720w import cli, transport
from deli720w.raster import Label
from deli720w.tspl import serialize


def test_trim_removes_only_bottom_white_rows_and_keeps_label_size():
    label = Label(30, 50, 203, ("TEST",))
    image = Image.new("1", (240, 400), 1)
    image.putpixel((0, 0), 0)
    image.putpixel((239, 12), 0)
    full, full_meta = serialize(label, image)
    trimmed, meta = serialize(label, image, trim_blank_bottom=True)
    assert trimmed.startswith(b"SIZE 30 mm,50 mm\r\nCLS\r\nBITMAP 0,0,30,13,0,")
    assert meta["pixel_height"] == 400
    assert meta["bitmap_height_dots"] == 13
    assert meta["bitmap_data_bytes"] == 30 * 13
    assert full_meta["bitmap_height_dots"] == 400
    full_data = full.split(b"BITMAP 0,0,30,400,0,", 1)[1][:30 * 13]
    trim_data = trimmed.split(b"BITMAP 0,0,30,13,0,", 1)[1][:30 * 13]
    assert trim_data == full_data


def test_send_guard_rejects_bad_hash_copies_and_size_before_scan(monkeypatch, tmp_path):
    async def forbidden(**kwargs):
        raise AssertionError("BLE scan attempted")

    monkeypatch.setattr(transport.BleakScanner, "discover", forbidden)
    job, _ = serialize(Label(30, 50, 203, ("TEST",)), trim_blank_bottom=True)
    report = tmp_path / "report.json"
    with pytest.raises(ValueError, match="SHA-256"):
        transport.send_approved_job(address="AA", target_name="DL-720W(NEW)ABCD", job=job, approved_hash="0" * 64, copies=1, report_path=report)
    with pytest.raises(ValueError, match="copies"):
        transport.send_approved_job(address="AA", target_name="DL-720W(NEW)ABCD", job=job, approved_hash=sha256(job).hexdigest(), copies=3, report_path=report)
    with pytest.raises(ValueError, match="target name"):
        transport.send_approved_job(address="AA", target_name="Headphones", job=job, approved_hash=sha256(job).hexdigest(), copies=1, report_path=report)
    oversize = job + b"X" * transport.MAX_JOB_BYTES
    with pytest.raises(ValueError, match="ceiling"):
        transport.send_approved_job(address="AA", target_name="DL-720W(NEW)ABCD", job=oversize, approved_hash=sha256(oversize).hexdigest(), copies=1, report_path=report)
    assert not report.exists()


def test_cli_routes_only_fully_explicit_send(monkeypatch, tmp_path):
    calls = []

    def fake_send(**kwargs):
        calls.append(kwargs)
        return {"copies_write_complete": 2}

    monkeypatch.setattr(cli, "send_approved_job", fake_send)
    report = tmp_path / "report.json"
    assert cli.main(["print", "--send", "--width-mm", "30", "--height-mm", "50", "--text", "TEST"]) == 3
    assert not calls
    assert cli.main(["print", "--send", "--protocol", "tspl", "--transport", "ble", "--width-mm", "30", "--height-mm", "50", "--text", "TEST", "--trim-blank-bottom", "--copies", "2", "--target-address", "AA", "--target-name", "DL-720W(NEW)ABCD", "--approve-job-sha256", "f" * 64, "--report-json", str(report)]) == 0
    assert len(calls) == 1
    assert calls[0]["copies"] == 2
    assert calls[0]["target_name"] == "DL-720W(NEW)ABCD"
    assert calls[0]["approved_hash"] == "f" * 64
    assert calls[0]["job"].startswith(b"SIZE 30 mm,50 mm\r\nCLS\r\nBITMAP")


def test_two_copy_single_session_with_mock_ble(monkeypatch, tmp_path):
    name = "DL-720W(NEW)ABCD"
    target = SimpleNamespace(name=name, address="AA")
    rx = SimpleNamespace(uuid=transport.RX_UUID, properties=["write"])
    tx = SimpleNamespace(uuid=transport.TX_UUID, properties=["notify"])
    service = SimpleNamespace(uuid=transport.SERVICE_UUID, characteristics=[rx, tx])
    calls = []

    async def discover(**kwargs):
        calls.append("scan")
        return {"target": (target, SimpleNamespace(local_name=name))}

    class Client:
        def __init__(self, device, timeout):
            assert device is target
            self.is_connected = False
            self.services = [service]
            calls.append("create")

        async def connect(self):
            self.is_connected = True
            calls.append("connect")

        async def start_notify(self, char, callback):
            assert char is tx
            callback(tx, b"\x10")
            calls.append("notify")

        async def write_gatt_char(self, char, data, response):
            assert char is rx and response is True and 1 <= len(data) <= 20
            calls.append(bytes(data))

        async def disconnect(self):
            calls.append("disconnect")
            self.is_connected = False

    async def fast_sleep(_seconds):
        return None

    monkeypatch.setattr(transport.BleakScanner, "discover", discover)
    monkeypatch.setattr(transport, "BleakClient", Client)
    monkeypatch.setattr(transport.asyncio, "sleep", fast_sleep)
    job, _ = serialize(Label(30, 50, 203, ("PAIR TEST",)), trim_blank_bottom=True)
    report_path = tmp_path / "attempt.json"
    result = transport.send_approved_job(address="AA", target_name=name, job=job, approved_hash=sha256(job).hexdigest(), copies=2, report_path=report_path)
    assert b"".join(call for call in calls if isinstance(call, bytes)) == job * 2
    assert calls.count("scan") == calls.count("connect") == calls.count("notify") == calls.count("disconnect") == 1
    assert result["copies_write_complete"] == 2
    assert result["physical_print_verified"] is False
    report = json.loads(report_path.read_text(encoding="utf-8"))
    assert report["bytes_acknowledged"] == len(job) * 2
    assert report["notify_hex"] == ["10"]
    assert "AA" not in report_path.read_text(encoding="utf-8")
