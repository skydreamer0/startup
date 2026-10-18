"""Offline TSPL BITMAP candidate based on the TSC command reference.

This serializes a job; it does not select a Bluetooth characteristic, frame BLE
packets, connect, or transmit. Compatibility with the DELI BLE path is untested.
"""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
from pathlib import Path

from PIL import Image

from .raster import Label, render


MODEL_DOTS_PER_MM = 8
MODEL_MAX_PRINT_WIDTH_DOTS = 640
MODEL_MIN_LENGTH_MM = 25
MODEL_MAX_LENGTH_MM = 300
TSPL_REFERENCE = "TSC TSPL/TSPL2 Programming Manual, BITMAP pages 67–69 (work/tspl-manual.pdf)"
DELI_MANUAL = "https://www.nbdeli.com/bocupload/2025/06/12/17497084791421e16wu.pdf"
DELI_MANUAL_SHA256 = "0269ba34a7ed55b04d5bd9773be09186a5dfce826c4e9e3cdcd2c86aee39047e"


@dataclass(frozen=True)
class Candidate:
    png: Path
    binary: Path
    metadata: Path
    row_bytes: int
    bitmap_bytes: int
    job_bytes: int


def pack_bitmap(image: Image.Image) -> tuple[bytes, int]:
    """Pack rows MSB-first, 0=black, with one/white bits in final-byte padding."""
    if image.mode != "1":
        raise ValueError("TSPL bitmap source must be a 1-bit image")
    width, height = image.size
    if not (1 <= width <= MODEL_MAX_PRINT_WIDTH_DOTS and height >= 1):
        raise ValueError("bitmap width must fit the 640-dot print head")
    row_bytes = (width + 7) // 8
    data = bytearray(b"\xff" * (row_bytes * height))
    pixels = image.load()
    for y in range(height):
        base = y * row_bytes
        for x in range(width):
            if pixels[x, y] == 0:
                data[base + x // 8] &= ~(1 << (7 - x % 8))
    return bytes(data), row_bytes


def serialize(label: Label, image: Image.Image | None = None, *, trim_blank_bottom: bool = False) -> tuple[bytes, dict]:
    if label.dpi != 203:
        raise ValueError("DL-720W NEW TSPL candidate requires 203 dpi (8 dots/mm)")
    if not (20 <= label.width_mm <= 80 and MODEL_MIN_LENGTH_MM <= label.height_mm <= MODEL_MAX_LENGTH_MM):
        raise ValueError("DL-720W NEW candidate requires width 20–80 mm and length 25–300 mm")
    expected = label.validate()
    if image is None:
        image = render(label)
    if image.size != expected:
        raise ValueError("raster dimensions do not match label dimensions")
    bitmap_image = image
    if trim_blank_bottom:
        # Bounding box of black pixels. Image mode 1 uses 0=black; invert for
        # getbbox(), then retain every row through the last black pixel.
        from PIL import ImageChops

        black_bbox = ImageChops.invert(image.convert("L")).getbbox()
        if black_bbox is None:
            raise ValueError("cannot serialize a completely blank label")
        bitmap_image = image.crop((0, 0, image.width, black_bbox[3]))
    bitmap, row_bytes = pack_bitmap(bitmap_image)
    # Numeric dimensions are validated above and formatted by us; user text is
    # rasterized, never interpolated into the TSPL command stream.
    width = format(label.width_mm, ".3f").rstrip("0").rstrip(".")
    height = format(label.height_mm, ".3f").rstrip("0").rstrip(".")
    header = f"SIZE {width} mm,{height} mm\r\nCLS\r\nBITMAP 0,0,{row_bytes},{bitmap_image.height},0,".encode("ascii")
    trailer = b"\r\nPRINT 1,1\r\n"
    job = header + bitmap + trailer
    metadata = {
        "status": "OFFLINE_CANDIDATE_BLUETOOTH_UNVERIFIED",
        "printer_model": "DELI DL-720W NEW",
        "protocol": "TSPL BITMAP mode 0 (overwrite)",
        "pixel_width": image.width,
        "pixel_height": image.height,
        "bitmap_height_dots": bitmap_image.height,
        "trim_blank_bottom": trim_blank_bottom,
        "dots_per_mm": MODEL_DOTS_PER_MM,
        "bitmap_row_bytes": row_bytes,
        "bitmap_data_bytes": len(bitmap),
        "job_bytes": len(job),
        "job_sha256": sha256(job).hexdigest(),
        "bit_order": "MSB first within each byte; black=0; final-byte padding=1",
        "commands": ["SIZE", "CLS", "BITMAP", "PRINT"],
        "media_gap_assumption": "none; media calibration and feed behavior unverified",
        "transport": "none; no BLE characteristic selected or written",
        "reference": {"tspl": TSPL_REFERENCE, "deli_manual": DELI_MANUAL, "deli_manual_sha256": DELI_MANUAL_SHA256},
    }
    return job, metadata


def save_candidate(label: Label, png_path: Path, *, trim_blank_bottom: bool = False) -> Candidate:
    if png_path.suffix.casefold() != ".png":
        raise ValueError("--output must end in .png for TSPL candidate export")
    image = render(label)
    job, metadata = serialize(label, image, trim_blank_bottom=trim_blank_bottom)
    binary_path = png_path.with_suffix(".tspl.bin")
    metadata_path = png_path.with_suffix(".tspl.json")
    png_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(png_path, format="PNG")
    binary_path.write_bytes(job)
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return Candidate(png_path, binary_path, metadata_path, metadata["bitmap_row_bytes"], metadata["bitmap_data_bytes"], metadata["job_bytes"])
