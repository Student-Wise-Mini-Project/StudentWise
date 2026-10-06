"""Receipt upload tests.

A receipt is a photo of what someone bought and where they were, so the rules
worth proving are that only the group can see it and that the server decides
what an image is -- not the request.
"""

import base64

import pytest
from sqlalchemy import select

from app import db as app_db
from app.config import settings
from app.models.receipt_image import ReceiptImage

#: A real 1x1 PNG. Small enough to inline, real enough that nothing is faked.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
WEBP = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"\x00" * 32


@pytest.fixture(autouse=True, params=["local", "database"])
def stored(request, tmp_path, monkeypatch, connection):
    """Run every test against both stores: files in development, Postgres in
    production. Returns a function listing what the store currently holds.

    Uploads stay out of the working tree, and the database store writes
    through the test's own connection, so its rows roll back with the test.
    """
    monkeypatch.setattr(settings, "receipt_storage", request.param)
    if request.param == "local":
        monkeypatch.setattr(settings, "receipt_storage_dir", str(tmp_path / "receipts"))
        return lambda: sorted(p.name for p in (tmp_path / "receipts").glob("*"))

    monkeypatch.setattr(app_db, "engine", connection)
    return lambda: [
        str(expense_id) for expense_id in connection.scalars(select(ReceiptImage.expense_id))
    ]


@pytest.fixture
def flat(client, alice, bob):
    alice_user, headers = alice
    bob_user, bob_headers = bob

    group = client.post(
        "/api/groups",
        json={"name": "Dizengoff 5", "type": "SHARED_APARTMENT"},
        headers=headers,
    ).json()
    client.post(
        f"/api/groups/{group['id']}/members", json={"email": "bob@example.com"}, headers=headers
    )
    expense = client.post(
        f"/api/groups/{group['id']}/expenses",
        json={
            "title": "Groceries",
            "total_amount": "100.00",
            "expense_date": "2026-09-01",
            "payer_id": alice_user["id"],
            "split_type": "EQUAL",
        },
        headers=headers,
    ).json()

    return {
        "group_id": group["id"],
        "expense_id": expense["id"],
        "headers": headers,
        "bob_headers": bob_headers,
        "alice": alice_user,
        "bob": bob_user,
    }


def upload(client, flat, data=PNG, filename="receipt.png", content_type="image/png", headers=None):
    return client.put(
        f"/api/expenses/{flat['expense_id']}/receipt",
        files={"file": (filename, data, content_type)},
        headers=headers or flat["headers"],
    )


# --- the happy path ------------------------------------------------------


def test_uploading_a_receipt_gives_the_expense_a_url(client, flat):
    response = upload(client, flat)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["receipt_url"] == f"/api/expenses/{flat['expense_id']}/receipt"
    # The storage key says where the file lives, which is nobody's business.
    assert "receipt_image_url" not in body


def test_an_expense_without_a_receipt_has_a_null_url(client, flat):
    body = client.get(f"/api/expenses/{flat['expense_id']}", headers=flat["headers"]).json()
    assert body["receipt_url"] is None


def test_the_image_comes_back_byte_for_byte(client, flat):
    upload(client, flat)
    response = client.get(f"/api/expenses/{flat['expense_id']}/receipt", headers=flat["headers"])
    assert response.status_code == 200
    assert response.content == PNG
    assert response.headers["content-type"] == "image/png"


@pytest.mark.parametrize(
    ("data", "expected"),
    [(PNG, "image/png"), (JPEG, "image/jpeg"), (WEBP, "image/webp")],
)
def test_every_allowed_format_round_trips(client, flat, data, expected):
    assert upload(client, flat, data=data).status_code == 200
    response = client.get(f"/api/expenses/{flat['expense_id']}/receipt", headers=flat["headers"])
    assert response.headers["content-type"] == expected


def test_uploading_again_replaces_rather_than_adds(client, flat):
    upload(client, flat, data=PNG)
    upload(client, flat, data=JPEG)
    response = client.get(f"/api/expenses/{flat['expense_id']}/receipt", headers=flat["headers"])
    assert response.content == JPEG
    assert response.headers["content-type"] == "image/jpeg"


def test_a_receipt_can_be_removed(client, flat):
    upload(client, flat)
    response = client.delete(f"/api/expenses/{flat['expense_id']}/receipt", headers=flat["headers"])
    assert response.status_code == 200
    assert response.json()["receipt_url"] is None
    assert (
        client.get(
            f"/api/expenses/{flat['expense_id']}/receipt", headers=flat["headers"]
        ).status_code
        == 404
    )


def test_removing_a_receipt_that_is_not_there(client, flat):
    assert (
        client.delete(
            f"/api/expenses/{flat['expense_id']}/receipt", headers=flat["headers"]
        ).status_code
        == 404
    )


# --- what counts as an image ---------------------------------------------


def test_the_declared_content_type_is_not_believed(client, flat):
    """A browser -- or an attacker -- can put anything in that header, so the
    bytes themselves decide."""
    response = upload(
        client,
        flat,
        data=b"<?php system($_GET['c']); ?>",
        filename="x.png",
        content_type="image/png",
    )
    assert response.status_code == 400
    assert "JPEG, PNG or WebP" in response.json()["detail"]


def test_a_pdf_is_refused(client, flat):
    """Bills arrive as PDFs from email, but that is mission 5.9's problem and
    goes through a different path."""
    response = upload(client, flat, data=b"%PDF-1.7\n%...", content_type="application/pdf")
    assert response.status_code == 400


def test_an_empty_upload_is_refused(client, flat):
    assert upload(client, flat, data=b"").status_code == 400


def test_an_oversized_upload_is_refused(client, flat, monkeypatch):
    monkeypatch.setattr(settings, "receipt_max_bytes", 100)
    response = upload(client, flat, data=PNG + b"\x00" * 200)
    assert response.status_code == 400
    assert "smaller" in response.json()["detail"]


# --- access --------------------------------------------------------------


def test_a_fellow_member_can_see_the_receipt(client, flat):
    upload(client, flat)
    response = client.get(
        f"/api/expenses/{flat['expense_id']}/receipt", headers=flat["bob_headers"]
    )
    assert response.status_code == 200


def test_an_outsider_cannot_see_or_replace_a_receipt(client, flat, make_user):
    upload(client, flat)
    _dave, dave_headers = make_user(email="dave@example.com", name="Dave")

    assert (
        client.get(f"/api/expenses/{flat['expense_id']}/receipt", headers=dave_headers).status_code
        == 403
    )
    assert upload(client, flat, headers=dave_headers).status_code == 403
    assert (
        client.delete(
            f"/api/expenses/{flat['expense_id']}/receipt", headers=dave_headers
        ).status_code
        == 403
    )


def test_reading_a_receipt_requires_authentication(client, flat):
    upload(client, flat)
    assert client.get(f"/api/expenses/{flat['expense_id']}/receipt").status_code == 401


def test_deleting_the_expense_takes_the_file_with_it(client, flat, stored):
    upload(client, flat)
    assert len(stored()) == 1

    assert (
        client.delete(f"/api/expenses/{flat['expense_id']}", headers=flat["headers"]).status_code
        == 204
    )
    assert stored() == []


def test_replacing_with_another_format_leaves_one_image(client, flat, stored):
    """The second upload has a different extension, so its key differs and the
    service deletes the previous key afterwards. That delete must not take the
    new image with it."""
    upload(client, flat, data=PNG)
    upload(client, flat, data=JPEG)
    assert len(stored()) == 1
    response = client.get(f"/api/expenses/{flat['expense_id']}/receipt", headers=flat["headers"])
    assert response.content == JPEG


def test_removing_the_receipt_removes_the_image(client, flat, stored):
    upload(client, flat)
    client.delete(f"/api/expenses/{flat['expense_id']}/receipt", headers=flat["headers"])
    assert stored() == []


def test_the_response_forbids_content_sniffing(client, flat):
    upload(client, flat)
    response = client.get(f"/api/expenses/{flat['expense_id']}/receipt", headers=flat["headers"])
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "private, max-age=3600"


def test_the_storage_key_cannot_be_set_through_the_api(client, flat):
    """The only thing that ever writes a key is the store itself. If a client
    could name one, every check in `LocalReceiptStore` would be moot."""
    response = client.patch(
        f"/api/expenses/{flat['expense_id']}",
        json={"receipt_image_url": "receipts/../../../etc/passwd", "title": "Groceries"},
        headers=flat["headers"],
    )
    assert response.status_code == 200
    assert response.json()["receipt_url"] is None
    assert (
        client.get(
            f"/api/expenses/{flat['expense_id']}/receipt", headers=flat["headers"]
        ).status_code
        == 404
    )
