from pathlib import Path

import pytest
from PIL import Image

from deli720w.cli import main
from deli720w.raster import Label
from deli720w.tspl import pack_bitmap, save_candidate, serialize


def test_bitmap_packing_exact_bytes_and_padding():
    image = Image.new("1", (9, 2), 1)
    for x, y in [(0, 0), (7, 0), (8, 0), (2, 1)]:
        image.putpixel((x, y), 0)
    packed, row_bytes = pack_bitmap(image)
    assert row_bytes == 2
    assert packed == bytes([0x7E, 0x7F, 0xDF, 0xFF])


def test_tspl_byte_framing_and_no_text_injection():
    label = Label(30, 50, 203, ('PRINT 99,99;\r\nCLS',), qr="abc")
    image = Image.new("1", (240, 400), 1)
    image.putpixel((0, 0), 0)
    job, meta = serialize(label, image)
    header = b"SIZE 30 mm,50 mm\r\nCLS\r\nBITMAP 0,0,30,400,0,"
    trailer = b"\r\nPRINT 1,1\r\n"
    assert job.startswith(header)
    assert job.endswith(trailer)
    assert len(job) == len(header) + 30 * 400 + len(trailer)
    assert job[len(header)] == 0x7F
    assert b"PRINT 99,99" not in job
    assert meta["bitmap_row_bytes"] == 30
    assert meta["bitmap_data_bytes"] == 12000
    assert meta["pixel_width"] == 240
    assert meta["pixel_height"] == 400


@pytest.mark.parametrize("label", [
    Label(80.1, 50, 203, ("x",)),
    Label(19.9, 50, 203, ("x",)),
    Label(30, 24.9, 203, ("x",)),
    Label(30, 300.1, 203, ("x",)),
    Label(30, 50, 300, ("x",)),
    Label(float("nan"), 50, 203, ("x",)),
])
def test_tspl_rejects_unsupported_dimensions(label):
    with pytest.raises(ValueError):
        serialize(label)


def test_candidate_files_and_cli_send_refusal(tmp_path: Path):
    label = Label(30, 50, 203, ("繁體中文",), qr="ABCD", code128="1234")
    png = tmp_path / "sample.png"
    candidate = save_candidate(label, png)
    assert candidate.png.exists() and candidate.binary.exists() and candidate.metadata.exists()
    assert candidate.bitmap_bytes == candidate.row_bytes * 400
    assert candidate.binary.read_bytes().startswith(b"SIZE 30 mm,50 mm\r\nCLS\r\nBITMAP")
    blocked = tmp_path / "blocked.png"
    assert main(["print", "--send", "--protocol", "tspl", "--width-mm", "30", "--height-mm", "50", "--text", "X", "--output", str(blocked)]) == 3
    assert not blocked.exists() and not blocked.with_suffix(".tspl.bin").exists()
