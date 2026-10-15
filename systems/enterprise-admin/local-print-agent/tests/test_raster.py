from pathlib import Path

import pytest
from PIL import Image, ImageChops

from deli720w.raster import Label, render, save_preview


def test_mixed_label_is_monochrome_and_has_ink(tmp_path: Path):
    label = Label(80, 50, 203, ("DELI sample", "繁體中文標籤"), "https://example.com/123", "ABC123")
    path = tmp_path / "preview.png"
    size = save_preview(label, path)
    image = Image.open(path)
    assert image.size == size == (640, 400)
    assert image.mode == "1"
    assert image.getbbox() is not None
    assert image.getextrema() == (0, 255)


@pytest.mark.parametrize("label", [
    Label(9, 40, 203, ("hello",)),
    Label(80, 40, 203),
    Label(80, 40, 203, ("a", "b", "c", "d")),
    Label(80, 40, 203, code128="中文"),
    Label(80, 40, 203, qr="x" * 501),
    Label(150, 300, 600, ("large",)),
])
def test_invalid_input_rejected(label):
    with pytest.raises(ValueError):
        render(label)


def test_barcode_rejects_unreadably_narrow_label():
    with pytest.raises(ValueError, match="two pixels per module"):
        render(Label(15, 40, 203, code128="A" * 48))


def test_barcode_has_native_module_width_and_quiet_zones():
    image = render(Label(80, 40, 203, code128="ABC123"))
    ink = ImageChops.invert(image.convert("L")).getbbox()
    assert ink is not None
    y = (ink[1] + ink[3]) // 2
    row = [image.getpixel((x, y)) for x in range(image.width)]
    assert row.count(0) > 0
    first_black = row.index(0)
    last_black = len(row) - 1 - row[::-1].index(0)
    assert first_black >= 20
    assert image.width - last_black - 1 >= 20


def test_30_by_50_combined_layout_keeps_ink_in_upper_32_mm():
    label = Label(30, 50, 203, ("QR + CODE128",), "DELI-720W-NEW", "1234")
    image = render(label)
    ink = ImageChops.invert(image.convert("L")).getbbox()
    assert image.size == (240, 400)
    assert ink is not None and ink[3] <= 256
    assert ink[0] >= 16 and ink[2] <= 224
