"""Command-line interface. Transmitting a job is deliberately unsupported."""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
import platform
import re
import sys

from bleak.exc import BleakError

from . import __version__
from .ble import scan, services
from .raster import Label, save_preview
from .tspl import save_candidate
from .tspl import serialize
from .transport import send_approved_job


BLOCKED_MESSAGE = "BLE send requires --protocol tspl --transport ble, exact --target-address and --target-name, --approve-job-sha256, and --report-json. No job was sent."


def _redact_name(name: str) -> str:
    return re.sub(r"(?i)(DL-720W\(NEW\))[0-9a-f]{4}$", r"\1[suffix redacted]", name)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="deli720w", description="DELI DL-720W NEW BLE discovery and offline label previews")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("diagnose", help="show environment and printing safety state")
    listing = sub.add_parser("list", help="scan BLE advertisements for DELI / 720W names")
    listing.add_argument("--timeout", type=float, default=8)
    listing.add_argument("--show-address", action="store_true", help="explicitly display Bluetooth addresses")
    listing.add_argument("--report-json", type=Path, help="save a redacted scan report as JSON")
    enum = sub.add_parser("services", help="connect only to an explicitly selected DELI-named advertisement; enumerate GATT metadata")
    enum.add_argument("--target-address", required=True)
    enum.add_argument("--scan-timeout", type=float, default=8)
    enum.add_argument("--connection-timeout", type=float, default=8)
    enum.add_argument("--report-json", type=Path, help="save redacted service metadata as JSON")
    printing = sub.add_parser("print", help="render a label preview or report unavailable printer transport")
    mode = printing.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="save a local monochrome PNG")
    mode.add_argument("--send", action="store_true", help="send a reviewed TSPL job over the verified DELI BLE channel")
    printing.add_argument("--width-mm", type=float, required=True)
    printing.add_argument("--height-mm", type=float, required=True)
    printing.add_argument("--dpi", type=int, default=203)
    printing.add_argument("--text", action="append", default=[], help="one line; repeat for up to three lines")
    printing.add_argument("--qr", help="QR content")
    printing.add_argument("--code128", help="printable ASCII Code 128 content")
    printing.add_argument("--output", type=Path, help="PNG output path for --dry-run")
    printing.add_argument("--protocol", choices=["preview", "tspl"], default="preview", help="offline output format; tspl also writes candidate binary and JSON metadata")
    printing.add_argument("--transport", choices=["none", "ble"], default="none", help="explicit transport selection for --send")
    printing.add_argument("--target-address", help="exact BLE address from list --show-address")
    printing.add_argument("--target-name", help="exact advertised model name from list --show-address")
    printing.add_argument("--approve-job-sha256", help="exact hash of the reviewed TSPL candidate job")
    printing.add_argument("--report-json", type=Path, help="fresh private JSON report path; may contain device notifications")
    printing.add_argument("--copies", type=int, default=1, help="1 or 2 labels in one connection")
    printing.add_argument("--trim-blank-bottom", action="store_true", help="omit trailing all-white BITMAP rows while preserving SIZE")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "diagnose":
            print(f"deli720w {__version__}; Python {platform.python_version()}; OS {platform.platform()}")
            print("One English TSPL label was physically verified over this printer's ISSC BLE channel.")
            print("Physical sends require explicit target, exact job SHA-256 approval, and a private attempt report.")
            return 0
        if args.command == "list":
            devices = asyncio.run(scan(args.timeout))
            if not devices:
                print("No DELI / 720W named BLE advertisement observed.")
            for device in devices:
                address = device.address if args.show_address else "[redacted; use --show-address to select for services]"
                print(f"name={device.name!r} address={address} RSSI={device.rssi} advertised_services={','.join(device.service_uuids) or '-'}")
            if args.report_json:
                report = {
                    "observed_at_utc": datetime.now(timezone.utc).isoformat(),
                    "operation": "advertisement_scan_only",
                    "scan_timeout_seconds": args.timeout,
                    "devices": [
                        {"name": _redact_name(device.name), "address": "[redacted]", "rssi": device.rssi, "advertised_services": list(device.service_uuids)}
                        for device in devices
                    ],
                }
                args.report_json.parent.mkdir(parents=True, exist_ok=True)
                args.report_json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
            return 0
        if args.command == "services":
            result = asyncio.run(services(args.target_address, scan_timeout=args.scan_timeout, connection_timeout=args.connection_timeout))
            print(f"name={result['name']!r} MTU={result['mtu']}")
            for service in result["services"]:
                print(f"service {service['uuid']}")
                for char in service["characteristics"]:
                    print(f"  characteristic {char['uuid']} properties={','.join(char['properties'])}")
            if args.report_json:
                report = {"observed_at_utc": datetime.now(timezone.utc).isoformat(), "operation": "targeted_gatt_metadata_only", "address": "[redacted]", **result}
                report["name"] = _redact_name(result["name"])
                args.report_json.parent.mkdir(parents=True, exist_ok=True)
                args.report_json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
            return 0
        if args.command == "print":
            if args.copies not in (1, 2):
                raise ValueError("--copies must be 1 or 2")
            if args.send:
                if (args.protocol != "tspl" or args.transport != "ble" or not args.target_address
                        or not args.target_name or not args.approve_job_sha256 or args.report_json is None):
                    print(BLOCKED_MESSAGE, file=sys.stderr)
                    return 3
                label = Label(args.width_mm, args.height_mm, args.dpi, tuple(args.text), args.qr, args.code128)
                job, metadata = serialize(label, trim_blank_bottom=args.trim_blank_bottom)
                result = send_approved_job(address=args.target_address, target_name=args.target_name, job=job,
                                           approved_hash=args.approve_job_sha256,
                                           copies=args.copies, report_path=args.report_json)
                print(f"BLE writes acknowledged for {result['copies_write_complete']} label(s); physical result requires inspection. Private report: {args.report_json.resolve()}")
                return 0
            if args.output is None:
                raise ValueError("--output is required for --dry-run")
            label = Label(args.width_mm, args.height_mm, args.dpi, tuple(args.text), args.qr, args.code128)
            if args.protocol == "tspl":
                candidate = save_candidate(label, args.output, trim_blank_bottom=args.trim_blank_bottom)
                print(f"Saved preview: {candidate.png.resolve()}")
                print(f"Saved offline TSPL candidate: {candidate.binary.resolve()} ({candidate.job_bytes} bytes)")
                print(f"Saved candidate metadata: {candidate.metadata.resolve()}")
                print("This specific rendered job has not been physically verified; no transmission occurred.")
            else:
                size = save_preview(label, args.output)
                print(f"Saved monochrome preview: {args.output.resolve()} ({size[0]} x {size[1]} pixels)")
            print("No BLE write or printer job was attempted.")
            return 0
    except (ValueError, OSError, RuntimeError, BleakError, asyncio.TimeoutError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 2
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
