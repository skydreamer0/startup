"""Pure guard controls only. These do not constitute HTTP/browser acceptance."""
import importlib.util
from pathlib import Path
import socket
import sys
import unittest

spec = importlib.util.spec_from_file_location("disabled_agent", Path(__file__).with_name("medicine-label-disabled-agent.py"))
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)


class GuardTests(unittest.TestCase):
    def test_device_operations_fail_before_dispatch(self):
        guard = agent.DeviceGuard()
        probes = [("socket.__new__", (None, socket.AF_UNIX, 1, 0)),
                  ("socket.connect", (None, "/run/dbus/system_bus_socket")),
                  ("socket.connect", (None, ("192.0.2.1", 9100))),
                  ("open", ("/dev/usb/lp0", "wb", 0)), ("os.listdir", ("/dev",)),
                  ("os.scandir", ("/sys/bus/usb",)), ("subprocess.Popen", ("unused",))]
        for event, args in probes:
            with self.subTest(event=event, args=args), self.assertRaises(RuntimeError):
                guard.audit(event, args)
        self.assertEqual(guard.calls, len(probes))
        with self.assertRaises(RuntimeError):
            guard.block()
        self.assertEqual(guard.calls, len(probes) + 1)

    def test_loopback_and_render_files_allowed(self):
        guard = agent.DeviceGuard()
        for event, args in [("socket.__new__", (None, socket.AF_INET, 1, 0)),
                            ("socket.connect", (None, ("127.0.0.1", 8765))),
                            ("open", ("/usr/share/fonts/example.ttf", "rb", 0)),
                            ("open", ("/dev/urandom", "rb", 0))]:
            guard.audit(event, args)
        self.assertEqual(guard.calls, 0)

    def test_real_audit_hook_rejects_before_socket_creation(self):
        guard = agent.DeviceGuard()
        sys.addaudithook(guard.audit)
        with self.assertRaises(RuntimeError):
            socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.assertEqual(guard.calls, 1)

    def test_unowned_configuration_rejected(self):
        with self.assertRaises(ValueError):
            agent.configuration({})
        base = {"MEDICINE_TEST_CI": "github-hosted-owned-fixture", "MEDICINE_TEST_TOKEN": "a" * 64}
        for origin in ["https://example.com", "http://localhost:5173", "http://127.0.0.1:5173/path"]:
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                agent.configuration({**base, "MEDICINE_TEST_ORIGIN": origin})
        with self.assertRaises(ValueError):
            agent.configuration({**base, "MEDICINE_TEST_TOKEN": "short"})


if __name__ == "__main__":
    unittest.main()
