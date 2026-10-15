"""Reviewed 50 x 30 mm landscape medicine identity label on 30 x 50 mm stock.

The preview is landscape. The printer bitmap is rotated onto the 240-dot head;
the physical media dimensions remain 30 mm across and 50 mm along feed.
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
    strength: str
    dosage_form: str
    generic_name: str
    nhi_code: str
    license_number: str
    sku: str

    @classmethod
    def from_payload(cls, payload: object) -> "MedicineIdentity":
        keys = set(cls.__dataclass_fields__)
        if not isinstance(payload, dict) or set(payload) != keys:
            raise ValueError("medicine must contain exactly the seven identity fields")
        values = {}
        limits = {"name": 80, "strength": 40, "dosage_form": 40,
                  "generic_name": 120, "nhi_code": 40, "license_number": 120, "sku": 24}
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
    """Return (landscape operator preview, rotated physical printer bitmap)."""
    canvas = Image.new("1", (WIDTH, HEIGHT), 1)
    draw = ImageDraw.Draw(canvas)
    left = 12
    _draw_fit(draw, left, 10, "藥品識別標籤", 250, 16, 15, 12)
    title = " ".join((identity.name, identity.strength, identity.dosage_form))
    _draw_fit(draw, left, 38, title, 263, 26, 25, 15)
    _draw_fit(draw, left, 76, identity.generic_name, 263, 21, 19, 12)
    draw.line((left, 107, 272, 107), fill=0, width=1)
    _draw_fit(draw, left, 119, "健保碼", 58, 17, 15, 12)
    _draw_fit(draw, 78, 119, identity.nhi_code, 195, 17, 16, 11)
    _draw_fit(draw, left, 152, "藥證", 48, 17, 15, 12)
    _draw_fit(draw, 65, 152, identity.license_number, 208, 17, 15, 10)
    _draw_fit(draw, left, 197, "SKU", 50, 24, 20, 16)
    _draw_fit(draw, 69, 197, identity.sku, 203, 24, 20, 13)

    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=4, box_size=1)
    qr.add_data(identity.qr_payload)
    qr.make(fit=True)
    modules = qr.modules_count + 8
    module_size = min(3, 105 // modules)
    if module_size < 3:
        raise ValueError("internal SKU QR is too dense for a 203 dpi label")
    side = modules * module_size
    code = qr.make_image(fill_color="black", back_color="white").convert("1")
    code = code.resize((side, side), Image.Resampling.NEAREST)
    canvas.paste(code, (284 + (105 - side) // 2, 43))
    _draw_fit(draw, 286, 152, "掃碼識別", 102, 18, 16, 12)
    _draw_fit(draw, 279, 188, "P1 · 內部識別", 112, 20, 14, 11)
    return canvas, canvas.transpose(Image.Transpose.ROTATE_90)
