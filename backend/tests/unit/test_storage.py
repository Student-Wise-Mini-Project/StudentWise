"""Attacks on the receipt store, run against the store itself.

The API tests upload files through the front door. These go round the back and
hand the store the keys a compromised or buggy caller might: traversal, wrong
extensions, files that claim to be images. Nothing here needs a database.
"""

import uuid

import pytest

from app.config import settings
from app.core.errors import BadRequestError, NotFoundError
from app.core.storage import LocalReceiptStore, content_type_for, sniff_image_type

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 32
WEBP = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"\x00" * 32


@pytest.fixture
def store(tmp_path):
    return LocalReceiptStore(tmp_path)


# --- what the bytes actually are -----------------------------------------


@pytest.mark.parametrize(
    ("data", "expected"),
    [
        (PNG, "image/png"),
        (JPEG, "image/jpeg"),
        (WEBP, "image/webp"),
    ],
)
def test_real_images_are_recognised(data, expected):
    assert sniff_image_type(data) == expected


@pytest.mark.parametrize(
    "data",
    [
        b"",
        b"\x89PNG",  # truncated signature
        b"%PDF-1.7\n",
        b"GIF89a" + b"\x00" * 32,  # a real image, deliberately not on the list
        b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>",
        b"<?php system($_GET['c']); ?>",
        b"RIFF" + b"\x00\x00\x00\x00" + b"WAVE" + b"\x00" * 32,  # RIFF, but audio
        b"MZ\x90\x00",  # a Windows executable
        b"\x1f\x8b\x08",  # gzip
    ],
)
def test_everything_else_is_refused(data):
    assert sniff_image_type(data) is None


def test_a_polyglot_is_stored_but_never_served_as_a_document(store):
    """A file can be a valid PNG *and* valid HTML. We accept it as an image,
    which is why the response also carries X-Content-Type-Options: nosniff."""
    polyglot = b"\x89PNG\r\n\x1a\n<html><script>alert(1)</script></html>"
    key = store.save(expense_id=uuid.uuid4(), data=polyglot)
    assert content_type_for(key) == "image/png"


# --- keys cannot walk out of the directory -------------------------------


@pytest.mark.parametrize(
    "key",
    [
        "receipts/../../../etc/passwd",
        "../secrets.png",
        "/etc/passwd",
        "receipts/..%2f..%2fetc%2fpasswd",
        "receipts\\..\\..\\windows\\win.ini",
        "receipts/.env",
        "receipts/not-a-uuid.png",
        # A real uuid, but not an extension we ever write.
        "receipts/2a1c8f4e-1f1a-4c5e-9c3b-2c9e7b4a5d61.php",
        "receipts/2A1C8F4E-1F1A-4C5E-9C3B-2C9E7B4A5D61.png",  # uppercase
        "2a1c8f4e-1f1a-4c5e-9c3b-2c9e7b4a5d61.png",  # no prefix
        "",
    ],
)
def test_a_key_that_was_not_generated_here_is_refused(store, key):
    with pytest.raises(NotFoundError):
        store.read(key)
    with pytest.raises(NotFoundError):
        store.delete(key)


def test_a_generated_key_stays_inside_the_root(store, tmp_path):
    expense_id = uuid.uuid4()
    key = store.save(expense_id=expense_id, data=PNG)

    assert key == f"receipts/{expense_id}.png"
    written = list(tmp_path.iterdir())
    assert [p.name for p in written] == [f"{expense_id}.png"]


def test_the_key_is_built_from_the_id_not_the_upload(store):
    """Nothing a user typed reaches the filesystem: no original filename, no
    declared content type, just the expense's own uuid."""
    expense_id = uuid.UUID("2a1c8f4e-1f1a-4c5e-9c3b-2c9e7b4a5d61")
    assert store.save(expense_id=expense_id, data=JPEG).endswith(f"{expense_id}.jpg")


# --- size and emptiness --------------------------------------------------


def test_an_empty_file_is_refused(store):
    with pytest.raises(BadRequestError):
        store.save(expense_id=uuid.uuid4(), data=b"")


def test_an_oversized_file_is_refused(store, monkeypatch):
    monkeypatch.setattr(settings, "receipt_max_bytes", 64)
    with pytest.raises(BadRequestError, match="smaller"):
        store.save(expense_id=uuid.uuid4(), data=PNG + b"\x00" * 128)


def test_a_file_exactly_at_the_limit_is_allowed(store, monkeypatch):
    data = PNG + b"\x00" * (64 - len(PNG))
    monkeypatch.setattr(settings, "receipt_max_bytes", 64)
    assert store.save(expense_id=uuid.uuid4(), data=data)


# --- reading and deleting ------------------------------------------------


def test_reading_round_trips(store):
    key = store.save(expense_id=uuid.uuid4(), data=JPEG)
    assert store.read(key) == JPEG


def test_a_missing_file_is_reported_not_hidden(store):
    """The row says there is a receipt and the file is gone. That is data loss,
    and it should look like it."""
    key = store.save(expense_id=uuid.uuid4(), data=PNG)
    store.delete(key)
    with pytest.raises(NotFoundError, match="missing from storage"):
        store.read(key)


def test_deleting_twice_is_not_an_error(store):
    key = store.save(expense_id=uuid.uuid4(), data=PNG)
    store.delete(key)
    store.delete(key)
