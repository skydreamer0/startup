"""Reviewed 50 x 30 mm landscape medicine identity label on 50 x 30 mm stock.

The physical printer bitmap is the operator preview rotated 180 degrees. This
orientation was selected by the operator from two numbered physical probes.
"""

from __future__ import annotations

from dataclasses import dataclass
import re

from PIL import Image, ImageDraw
import qrcode

from .raster import _font


WIDTH = 400
HEIGHT = 240
SKU = re.compile(r"[A-Za-z0-9._-]{1,24}\Z")


@dataclass(frozen=True)
class MedicineIdentity:
    name: str
    english_name: str
    strength: str
    dosage_form: str
    generic_name: str
    nhi_code: str
    license_number: str
    sku: str
    storage_location: str

    @classmethod
    def from_payload(cls, payload: object) -> "MedicineIdentity":
        keys = set(cls.__dataclass_fields__)
        if not isinstance(payload, dict) or set(payload) != keys:
            raise ValueError("medicine must contain exactly the nine identity fields")
        values = {}
        limits = {"name": 80, "english_name": 120, "strength": 40, "dosage_form": 40,
                  "generic_name": 120, "nhi_code": 40, "license_number": 120,
                  "sku": 24, "storage_location": 40}
        for key in keys:
            value = payload[key]
            if (not isinstance(value, str) or not value or value != value.strip()
                    or len(value) > limits[key] or any(ord(char) < 32 for char in value)):
                raise ValueError(f"medicine.{key} must be nonempty reviewed single-line text")
            values[key] = value
        if not SKU.fullmatch(values["sku"]):
            raise ValueError("medicine.sku must be 1–24 ASCII letters, digits, dots, dashes or underscores")
        return cls(**values)

    @property
    def qr_payload(self) -> str:
        return "P1:" + self.sku


def _draw_fit(draw: ImageDraw.ImageDraw, x: int, y: int, text: str,
              max_width: int, max_height: int, start_size: int, min_size: int,
              *, fill: int = 0) -> None:
    cjk = any(ord(char) > 127 for char in text)
    for size in range(start_size, min_size - 1, -1):
        font = _font(size, cjk=cjk)
        box = draw.textbbox((0, 0), text, font=font)
        if box[2] - box[0] <= max_width and box[3] - box[1] <= max_height:
            draw.text((x, y - box[1]), text, fill=fill, font=font)
            return
    raise ValueError("medicine label text does not fit the 50 x 30 mm layout")


def render_medicine_label(identity: MedicineIdentity) -> tuple[Image.Image, Image.Image]:
    """Return (upright operator preview, physically accepted printer bitmap)."""
    canvas = Image.new("1", (WIDTH, HEIGHT), 1)
    draw = ImageDraw.Draw(canvas)
    left = 12
    title = " ".join((identity.name, identity.strength, identity.dosage_form))
    _draw_fit(draw, left, 10, title, 376, 27, 27, 17)
    _draw_fit(draw, left, 45, identity.english_name, 376, 25, 24, 16)
    _draw_fit(draw, left, 79, identity.generic_name, 376, 24, 22, 15)
    draw.line((left, 109, 388, 109), fill=0, width=1)
    _draw_fit(draw, left, 119, identity.nhi_code, 307, 21, 19, 13)
    _draw_fit(draw, left, 146, identity.license_number, 307, 19, 17, 11)
    _draw_fit(draw, left, 179, identity.sku, 305, 18, 16, 11)
    _draw_fit(draw, left, 209, identity.storage_location, 305, 17, 15, 11)

    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=4, box_size=1)
    qr.add_data(identity.qr_payload)
    qr.make(fit=True)
    modules = qr.modules_count + 8
    module_size = min(2, 64 // modules)
    if module_size < 2:
        raise ValueError("internal SKU QR is too dense for a 203 dpi label")
    side = modules * module_size
    code = qr.make_image(fill_color="black", back_color="white").convert("1")
    code = code.resize((side, side), Image.Resampling.NEAREST)
    canvas.paste(code, (329 + (64 - side) // 2, 162))
    return canvas, canvas.transpose(Image.Transpose.ROTATE_180)
