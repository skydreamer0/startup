"""Pure layout and physical-orientation checks; no BLE write."""

from dataclasses import asdict

import pytest
from PIL import Image

from deli720w.medicine_label import MedicineIdentity, render_medicine_label
from deli720w.raster import Label
from deli720w.tspl import pack_bitmap, serialize


IDENTITY = MedicineIdentity(
    name="示範藥品", strength="10 mg", dosage_form="錠",
    generic_name="Example ingredient 10 mg", nhi_code="XXXXXXXXXXXX",
    license_number="衛部藥製字第XXXXXX號", sku="MED-000123",
)


def test_landscape_preview_matches_operator_selected_physical_orientation():
    preview, physical = render_medicine_label(IDENTITY)
    assert preview.size == (400, 240)
    assert physical.size == (400, 240)
    assert physical.transpose(Image.Transpose.ROTATE_180).tobytes() == preview.tobytes()
    job, metadata = serialize(Label(50, 30, 203, (IDENTITY.name,)), image=physical)
    bitmap, row_bytes = pack_bitmap(physical)
    assert row_bytes == 50 and bitmap in job
    assert metadata["pixel_width"] == 400 and metadata["pixel_height"] == 240


def test_internal_qr_identity_and_incomplete_or_oversized_content():
    assert IDENTITY.qr_payload == "P1:MED-000123"
    assert MedicineIdentity.from_payload(asdict(IDENTITY)) == IDENTITY
    for changed in ({"nhi_code": ""}, {"sku": "P1:MED-000123"}, {"license_number": "bad\nline"}):
        with pytest.raises(ValueError):
            MedicineIdentity.from_payload({**asdict(IDENTITY), **changed})
    with pytest.raises(ValueError, match="does not fit"):
        render_medicine_label(MedicineIdentity(**{**asdict(IDENTITY), "name": "過長藥品名稱" * 8}))
