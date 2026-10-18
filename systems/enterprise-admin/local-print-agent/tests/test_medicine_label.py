"""Pure layout and physical-orientation checks; no BLE write."""

from dataclasses import asdict

import pytest
from PIL import Image

from deli720w.medicine_label import MedicineIdentity, render_medicine_label
from deli720w.raster import Label
from deli720w.tspl import pack_bitmap, serialize


IDENTITY = MedicineIdentity(
    name="安舒悅100毫克", english_name="Aclonac",
    generic_name="Aceclofenac", nhi_code="AC58623100",
    license_number="衛署藥製字第058623號", sku="TEST-MED-001", storage_location="TEST-A01-02",
)


def test_landscape_preview_matches_operator_selected_physical_orientation():
    preview, physical = render_medicine_label(IDENTITY)
    assert preview.size == (400, 240)
    assert physical.size == (400, 240)
    assert all(preview.getpixel((x, y)) for x in range(328, 392) for y in range(0, 80))
    assert any(not preview.getpixel((x, y)) for x in range(328, 392) for y in range(85, 140))
    assert physical.transpose(Image.Transpose.ROTATE_180).tobytes() == preview.tobytes()
    job, metadata = serialize(Label(50, 30, 203, (IDENTITY.name,)), image=physical)
    bitmap, row_bytes = pack_bitmap(physical)
    assert row_bytes == 50 and bitmap in job
    assert metadata["pixel_width"] == 400 and metadata["pixel_height"] == 240


def test_internal_qr_identity_and_incomplete_or_oversized_content():
    assert IDENTITY.qr_payload == "P1:TEST-MED-001"
    other_sku = MedicineIdentity(**{**asdict(IDENTITY), "sku": "TEST-MED-002"})
    first_preview, _ = render_medicine_label(IDENTITY)
    second_preview, _ = render_medicine_label(other_sku)
    assert first_preview.crop((0, 0, 320, 240)).tobytes() == second_preview.crop((0, 0, 320, 240)).tobytes()
    assert first_preview.tobytes() != second_preview.tobytes()
    assert MedicineIdentity.from_payload(asdict(IDENTITY)) == IDENTITY
    for changed in ({"english_name": ""}, {"storage_location": ""}, {"nhi_code": ""},
                    {"sku": "P1:MED-000123"}, {"license_number": "bad\nline"},
                    {"name": "測試\u2028換行"}):
        with pytest.raises(ValueError):
            MedicineIdentity.from_payload({**asdict(IDENTITY), **changed})


def test_long_top_lines_shrink_independently_or_identify_unprintable_field():
    for field, value in (
        ("name", "測試用超長中文藥品名稱一百毫克錠"),
        ("english_name", "Example Extended Release Tablets"),
        ("generic_name", "Exampleaceclofenaclongname"),
    ):
        preview, _ = render_medicine_label(MedicineIdentity(**{**asdict(IDENTITY), field: value}))
        assert preview.size == (400, 240)

    for field, label, value in (
        ("name", "中文品名", "過長藥品名稱" * 8),
        ("english_name", "英文商品名", "LongEnglishName" * 12),
        ("generic_name", "學名", "LongGenericName" * 12),
    ):
        with pytest.raises(ValueError, match=f"{label}過長"):
            render_medicine_label(MedicineIdentity(**{**asdict(IDENTITY), field: value}))
