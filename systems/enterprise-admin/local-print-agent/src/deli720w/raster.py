"""Create a monochrome preview. No printer protocol is encoded here."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import math

import barcode
from PIL import Image, ImageDraw, ImageFont
import qrcode


MAX_PIXELS = 4096
MAX_TEXT_LINES = 3


@dataclass(frozen=True)
class Label:
    width_mm: float
    height_mm: float
    dpi: int
    lines: tuple[str, ...] = ()
    qr: str | None = None
    code128: str | None = None

    def validate(self) -> tuple[int, int]:
        if not (math.isfinite(self.width_mm) and math.isfinite(self.height_mm)):
            raise ValueError("width and height must be finite")
        if not (10 <= self.width_mm <= 150 and 10 <= self.height_mm <= 300):
            raise ValueError("width must be 10–150 mm and height 10–300 mm")
        if not (100 <= self.dpi <= 600):
            raise ValueError("dpi must be 100–600")
        dots_per_mm = 8 if self.dpi == 203 else self.dpi / 25.4
        size = (round(self.width_mm * dots_per_mm), round(self.height_mm * dots_per_mm))
        if max(size) > MAX_PIXELS:
            raise ValueError("raster exceeds 4096 pixels on one side")
        if not (self.lines or self.qr or self.code128):
            raise ValueError("add text, QR content, or Code 128 content")
        if len(self.lines) > MAX_TEXT_LINES:
            raise ValueError("at most three text lines are supported")
        if any(not line.strip() or len(line) > 100 for line in self.lines):
            raise ValueError("text lines must be 1–100 characters")
        if self.qr is not None and not (1 <= len(self.qr.encode("utf-8")) <= 500):
            raise ValueError("QR content must be 1–500 UTF-8 bytes")
        if self.code128 is not None and (
            not 1 <= len(self.code128) <= 48 or any(ord(c) < 32 or ord(c) > 126 for c in self.code128)
        ):
            raise ValueError("Code 128 content must be 1–48 printable ASCII characters")
        return size


def _font(size: int, *, cjk: bool) -> ImageFont.FreeTypeFont:
    candidates = (
        [Path("C:/Windows/Fonts/msjhbd.ttc"), Path("C:/Windows/Fonts/msjh.ttc"), Path("C:/Windows/Fonts/NotoSansTC-VF.ttf")]
        if cjk else [Path("C:/Windows/Fonts/arial.ttf")]
    )
    candidates += [Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")]
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size)
    raise RuntimeError("No suitable font found; install a Traditional Chinese font or DejaVu Sans")


def render(label: Label) -> Image.Image:
    width, height = label.validate()
    canvas = Image.new("1", (width, height), 1)
    margin = max(4, round(label.dpi / 25.4 * 2))
    gap = max(3, round(label.dpi / 25.4))
    available_width = width - 2 * margin
    available_height = height - 2 * margin
    draw = ImageDraw.Draw(canvas)

    # Keep short text near its actual font height, leaving a compact symbol
    # block at the top of the physical label instead of stretching it downward.
    has_symbol = bool(label.qr or label.code128)
    normal_font_size = max(8, round(label.dpi / 5))
    natural_text_height = normal_font_size * len(label.lines) + gap * max(0, len(label.lines) - 1)
    text_height = min(round(available_height * (0.42 if has_symbol else 1.0)), natural_text_height) if label.lines else 0
    if label.lines:
        row_height = max(1, (text_height - gap * (len(label.lines) - 1)) // len(label.lines))
        for index, line in enumerate(label.lines):
            font_size = min(row_height, normal_font_size)
            cjk = any(ord(char) > 127 for char in line)
            while font_size >= 8:
                font = _font(font_size, cjk=cjk)
                box = draw.textbbox((0, 0), line, font=font)
                if box[2] - box[0] <= available_width and box[3] - box[1] <= row_height:
                    break
                font_size -= 1
            else:
                raise ValueError(f"text line {index + 1} does not fit the label")
            y = margin + index * (row_height + gap) - box[1]
            draw.text((margin, y), line, fill=0, font=font)

    symbol_top = margin + text_height + (gap if label.lines and has_symbol else 0)
    symbol_height = height - margin - symbol_top
    if has_symbol and symbol_height < 35:
        raise ValueError("label has insufficient space for symbols")
    # For combined symbols, limit all ink to roughly the upper 64% of the
    # label. On 30 x 50 mm stock this is 256 dots / 32 mm from the top.
    compact_bottom = min(height - margin, round(height * 0.64))

    qr = None
    modules = 0
    if label.qr:
        qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=4, box_size=2)
        qr.add_data(label.qr)
        qr.make(fit=True)
        modules = qr.modules_count + 8
    bits = barcode.Code128(label.code128).build()[0] if label.code128 else None
    min_bar_width = 2 * (len(bits) + 20) if bits else 0
    stacked = bool(qr and bits and available_width < min_bar_width + gap + 2 * modules)

    side = 0
    if qr:
        qr_max_width = available_width if not bits or stacked else round(available_width * 0.38)
        qr_max_height = (compact_bottom - symbol_top - gap - 64) if stacked else symbol_height
        module_size = min(4, qr_max_width // modules, qr_max_height // modules)
        if module_size < 2:
            raise ValueError("QR code is too dense for this label size")
        side = modules * module_size
        qr_image = qr.make_image(fill_color="black", back_color="white").convert("1")
        qr_image = qr_image.resize((side, side), Image.Resampling.NEAREST)
        canvas.paste(qr_image, (margin, symbol_top))

    if bits:
        bar_x = margin if stacked or not qr else margin + side + gap
        bar_y = symbol_top + side + gap if stacked else symbol_top
        bar_width = available_width if stacked or not qr else width - margin - bar_x
        bar_height = min(64, symbol_height - side - gap if stacked else symbol_height,
                         compact_bottom - bar_y if stacked else symbol_height)
        quiet_modules = 10
        module_size = bar_width // (len(bits) + 2 * quiet_modules)
        if module_size < 2 or bar_height < 30:
            raise ValueError("Code 128 needs at least two pixels per module and ten-module quiet zones")
        draw_height = bar_height
        bar_top = bar_y
        bar_bottom = min(height - margin, bar_top + draw_height)
        for index, bit in enumerate(bits):
            if bit == "1":
                x = bar_x + (index + quiet_modules) * module_size
                draw.rectangle((x, bar_top, x + module_size - 1, bar_bottom - 1), fill=0)
    return canvas


def save_preview(label: Label, path: Path) -> tuple[int, int]:
    image = render(label)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG")
    return image.size
