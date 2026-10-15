"""Create the five-label review suite locally. No Bluetooth operations."""

from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path

from deli720w.raster import Label
from deli720w.tspl import save_candidate


OUT = Path(__file__).resolve().parents[1] / "samples" / "suite"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    labels = {
        "chinese": Label(30, 50, 203, ("繁體中文測試",)),
        "qr_code128": Label(30, 50, 203, ("QR + CODE128",), "DELI-720W-NEW", "1234"),
        "pair": Label(30, 50, 203, ("PAIR TEST",)),
    }
    generated = {}
    for key, label in labels.items():
        candidate = save_candidate(label, OUT / f"{key}.png", trim_blank_bottom=True)
        metadata = json.loads(candidate.metadata.read_text(encoding="utf-8"))
        generated[key] = {
            "preview": candidate.png.name,
            "candidate_binary": candidate.binary.name,
            "metadata": candidate.metadata.name,
            "sha256": metadata["job_sha256"],
            "job_bytes": metadata["job_bytes"],
            "bitmap_height_dots": metadata["bitmap_height_dots"],
            "render_spec": {
                "width_mm": label.width_mm,
                "height_mm": label.height_mm,
                "dpi": label.dpi,
                "text": list(label.lines),
                "qr": label.qr,
                "code128": label.code128,
                "trim_blank_bottom": True,
            },
            "cli_render_args": [
                "print", "--protocol", "tspl", "--dry-run", "--trim-blank-bottom",
                "--width-mm", "30", "--height-mm", "50", "--dpi", "203",
                *[arg for line in label.lines for arg in ("--text", line)],
                *(["--qr", label.qr] if label.qr else []),
                *(["--code128", label.code128] if label.code128 else []),
            ],
        }

    def action(order: int, key: str, copies: int, purpose: str) -> dict:
        render_args = generated[key]["cli_render_args"]
        content_args = [arg for arg in render_args if arg != "--dry-run"]
        return {
            "order": order,
            "label": key,
            "copies": copies,
            "purpose": purpose,
            "cli_send_args_without_target_or_report": [
                *content_args, "--send", "--transport", "ble", "--copies", str(copies),
                "--approve-job-sha256", generated[key]["sha256"],
            ],
            "remaining_required_args": ["--target-address", "--target-name", "--report-json"],
        }
    manifest = {
        "status": "PREPARED_OFFLINE_NOT_SENT",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "printer_model": "DL-720W(NEW)",
        "label_size_mm": [30, 50],
        "transport": "ISSC BLE single-session per action; user approval required before each physical action",
        "job_generation": "TSPL BITMAP, 8 dots/mm, trailing white rows removed from bitmap; SIZE remains 30x50 mm",
        "labels": generated,
        "actions": [
            action(1, "chinese", 1, "Traditional Chinese rendering"),
            action(2, "qr_code128", 1, "QR and Code 128 scanning"),
            action(3, "pair", 2, "two labels in one BLE connection"),
            action(4, "chinese", 1, "new connection after pair; total five labels"),
        ],
        "physical_result": "unverified; no suite job has been sent",
    }
    path = OUT / "suite_manifest.json"
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(path)
    for key, item in generated.items():
        print(f"{key}: SHA-256 {item['sha256']} {item['job_bytes']} bytes BITMAP {item['bitmap_height_dots']} rows")


if __name__ == "__main__":
    main()
