"""CI-only real API/renderer with fail-fast physical-device tripwires.

No API response is mocked. Never use this entry point for an operator service.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import signal
import socket
import sys
import threading
from urllib.parse import urlsplit


class DeviceGuard:
    def __init__(self):
        self.calls = 0

    def block(self, *_args, **_kwargs):
        self.calls += 1
        raise RuntimeError("Physical device operation forbidden in CI")

    def audit(self, event, args):
        if event == "socket.__new__" and args[1] not in (socket.AF_INET, socket.AF_INET6):
            self.block()
        if event == "socket.connect":
            address = args[1]
            if not isinstance(address, tuple) or address[0] not in ("127.0.0.1", "::1"):
                self.block()
        if event in ("subprocess.Popen", "os.system", "os.posix_spawn"):
            self.block()
        if event in ("open", "os.listdir", "os.scandir") and isinstance(args[0], (str, bytes)):
            filename = os.fsdecode(args[0])
            resolved = os.path.realpath(filename)
            if ((resolved == "/dev" or resolved.startswith("/dev/"))
                    and resolved not in ("/dev/null", "/dev/urandom")) or resolved.startswith(("/sys/class/bluetooth", "/sys/bus/usb")):
                self.block()


def configuration(env):
    if env.get("MEDICINE_TEST_CI") != "github-hosted-owned-fixture":
        raise ValueError("Owned CI fixture marker required")
    token = env.get("MEDICINE_TEST_TOKEN", "")
    if not re.fullmatch(r"[a-f0-9]{64}", token):
        raise ValueError("Synthetic 32-byte token required")
    origin = env.get("MEDICINE_TEST_ORIGIN", "")
    parsed = urlsplit(origin)
    if (parsed.scheme != "http" or parsed.hostname != "127.0.0.1" or not parsed.port
            or origin != f"http://127.0.0.1:{parsed.port}"):
        raise ValueError("Exact isolated loopback origin required")
    work = Path(env["MEDICINE_TEST_WORK"]).resolve()
    if work != Path.cwd().resolve() or not work.name.startswith("medicine-disabled-"):
        raise ValueError("Owned temporary working directory required")
    return token, origin, work


def main():
    token, origin, work = configuration(os.environ)
    # Map the real renderer's CJK lookup to the existing CI-installed Noto font.
    # The alias exists only inside the disposable working directory.
    font = Path('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc')
    if not font.is_file():
        raise ValueError('Existing CI Noto CJK font is required')
    alias = work / 'C:/Windows/Fonts/msjhbd.ttc'
    alias.parent.mkdir(parents=True)
    alias.symlink_to(font)
    guard = DeviceGuard()
    sys.addaudithook(guard.audit)  # Install before importing any transport dependencies.
    import bleak

    class ForbiddenDevice:
        def __init__(self, *_args, **_kwargs):
            guard.block()

        discover = staticmethod(guard.block)
        find_device_by_address = staticmethod(guard.block)
        find_device_by_filter = staticmethod(guard.block)
        find_device_by_name = staticmethod(guard.block)

    bleak.BleakClient = ForbiddenDevice
    bleak.BleakScanner = ForbiddenDevice
    from deli720w import api, transport
    from http.server import ThreadingHTTPServer

    # Cover both the module and the API's imported send alias before handling requests.
    transport.BleakClient = ForbiddenDevice
    transport.BleakScanner = ForbiddenDevice
    transport.send_approved_job = guard.block
    api.send_approved_job = guard.block
    state = api.ApiState(token=token, port=8765, report_dir=work / "receipts",
                         printing_enabled=False, allowed_origins=frozenset({origin}))
    state.start_worker()  # Exercise the real disabled-worker gate.
    assert state.worker is None
    server = ThreadingHTTPServer(("127.0.0.1", 8765), api.make_handler(state))
    def stop(_signum, _frame):
        threading.Thread(target=server.shutdown, daemon=True).start()
    signal.signal(signal.SIGTERM, stop)
    try:
        server.serve_forever(poll_interval=0.1)
    finally:
        server.server_close()
        receipt = {"printingEnabled": state.printing_enabled, "workerStarted": state.worker is not None,
                   "deviceCalls": guard.calls, "queued": state.jobs.qsize(),
                   "receiptFiles": len(list((work / "receipts").iterdir())),
                   "tripwires": ["BleakClient", "BleakScanner", "send_approved_job",
                                 "non-IP sockets", "non-loopback connect", "device files/enumeration", "subprocess"]}
        (work / "device-tripwire.json").write_text(json.dumps(receipt) + "\n", encoding="utf-8")
    assert guard.calls == 0 and state.worker is None and state.jobs.empty()
    assert not list((work / "receipts").iterdir())


if __name__ == "__main__":
    main()
