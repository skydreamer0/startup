import asyncio
import json
from types import SimpleNamespace

import pytest

from deli720w import ble, cli


def test_send_fails_before_any_raster_or_ble(monkeypatch, tmp_path, capsys):
    def forbidden(*_args, **_kwargs):
        raise AssertionError("side effect attempted")

    monkeypatch.setattr(cli, "save_preview", forbidden)
    monkeypatch.setattr(cli, "scan", forbidden)
    monkeypatch.setattr(cli, "services", forbidden)
    path = tmp_path / "job.png"
    assert cli.main(["print", "--send", "--width-mm", "80", "--height-mm", "50", "--text", "TEST", "--output", str(path)]) == 3
    assert not path.exists()
    assert "no job was sent" in capsys.readouterr().err.lower()


def test_scan_filters_unrelated_devices(monkeypatch):
    printer = SimpleNamespace(name="DL-720W(NEW)ABCD", address="AA")
    unrelated = SimpleNamespace(name="Headphones", address="BB")

    async def discover(**kwargs):
        return {
            "a": (printer, SimpleNamespace(local_name="", rssi=-60, service_uuids=[])),
            "b": (unrelated, SimpleNamespace(local_name="", rssi=-40, service_uuids=[])),
        }

    monkeypatch.setattr(ble.BleakScanner, "discover", discover)
    found = asyncio.run(ble.scan(2))
    assert len(found) == 1 and found[0].address == "AA"


def test_list_json_redacts_address(monkeypatch, tmp_path):
    async def fake_scan(timeout):
        return [ble.SeenDevice("DL-720W(NEW)ABCD", "SECRET-ADDRESS", -60, ("service",))]

    monkeypatch.setattr(cli, "scan", fake_scan)
    report = tmp_path / "scan.json"
    assert cli.main(["list", "--timeout", "2", "--report-json", str(report)]) == 0
    data = json.loads(report.read_text(encoding="utf-8"))
    assert data["operation"] == "advertisement_scan_only"
    assert data["devices"][0]["address"] == "[redacted]"
    assert data["devices"][0]["name"] == "DL-720W(NEW)[suffix redacted]"
    assert "SECRET-ADDRESS" not in report.read_text(encoding="utf-8")


def test_services_never_connects_to_unrelated_name(monkeypatch):
    calls = []

    async def discover(**kwargs):
        return {"x": (SimpleNamespace(name="Headphones", address="AA"), SimpleNamespace(local_name="", rssi=-30))}

    def forbidden_client(*args, **kwargs):
        calls.append((args, kwargs))
        raise AssertionError("connected to unrelated device")

    monkeypatch.setattr(ble.BleakScanner, "discover", discover)
    monkeypatch.setattr(ble, "BleakClient", forbidden_client)
    with pytest.raises(ValueError, match="not observed"):
        asyncio.run(ble.services("AA", scan_timeout=2))
    assert not calls


def test_services_disconnects_and_only_enumerates_metadata(monkeypatch):
    target = SimpleNamespace(name="DL-720W(NEW)ABCD", address="AA")
    calls = []

    async def discover(**kwargs):
        return {"x": (target, SimpleNamespace(local_name="DL-720W(NEW)ABCD", rssi=-60))}

    class Client:
        def __init__(self, device, timeout):
            assert device is target
            calls.append("create")
            self.is_connected = False
            self.mtu_size = 223
            self.services = [SimpleNamespace(uuid="service", characteristics=[SimpleNamespace(uuid="char", properties=["notify"])])]

        async def connect(self):
            calls.append("connect")
            self.is_connected = True

        async def disconnect(self):
            calls.append("disconnect")
            self.is_connected = False

        async def write_gatt_char(self, *_args):
            raise AssertionError("GATT write attempted")

    monkeypatch.setattr(ble.BleakScanner, "discover", discover)
    monkeypatch.setattr(ble, "BleakClient", Client)
    result = asyncio.run(ble.services("AA", scan_timeout=2, connection_timeout=2))
    assert result["mtu"] == 223
    assert result["services"][0]["characteristics"][0]["properties"] == ["notify"]
    assert calls == ["create", "connect", "disconnect"]


@pytest.mark.parametrize("timeout", [0, -1, 31, float("inf"), float("nan")])
def test_scan_timeouts_bounded(timeout):
    with pytest.raises(ValueError):
        asyncio.run(ble.scan(timeout))
    with pytest.raises(ValueError):
        asyncio.run(ble.services("AA", scan_timeout=timeout))
