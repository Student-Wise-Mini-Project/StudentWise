"""The Postgres receipt store on its own (10.3).

The receipt API suite already runs against this store end to end; these cover
what the API cannot reach -- a key that did not come from `save`, and a row
that has gone missing.
"""

import base64
import uuid

import pytest
from sqlalchemy import select

from app.core.errors import NotFoundError
from app.core.storage import DatabaseReceiptStore
from app.models.receipt_image import ReceiptImage

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


@pytest.fixture
def expense_id(client, alice):
    alice_user, headers = alice
    group = client.post(
        "/api/groups", json={"name": "Flat", "type": "SHARED_APARTMENT"}, headers=headers
    ).json()
    expense = client.post(
        f"/api/groups/{group['id']}/expenses",
        json={
            "title": "Groceries",
            "total_amount": "10.00",
            "expense_date": "2026-09-01",
            "payer_id": alice_user["id"],
            "split_type": "EQUAL",
        },
        headers=headers,
    ).json()
    return uuid.UUID(expense["id"])


@pytest.fixture
def store(connection):
    return DatabaseReceiptStore(connection)


def test_save_returns_the_same_key_the_disk_store_would(store, expense_id):
    assert store.save(expense_id=expense_id, data=PNG) == f"receipts/{expense_id}.png"


def test_bytes_round_trip(store, expense_id):
    key = store.save(expense_id=expense_id, data=PNG)
    assert store.read(key) == PNG


@pytest.mark.parametrize(
    "key", ["receipts/../../etc/passwd", "../x.png", "receipts/not-a-uuid.png", ""]
)
def test_a_key_that_save_did_not_write_is_refused(store, key):
    with pytest.raises(NotFoundError):
        store.read(key)
    with pytest.raises(NotFoundError):
        store.delete(key)


def test_a_missing_row_is_reported_as_missing(store, expense_id):
    with pytest.raises(NotFoundError, match="missing from storage"):
        store.read(f"receipts/{expense_id}.png")


def test_the_wrong_extension_does_not_read_or_delete(store, expense_id, connection):
    store.save(expense_id=expense_id, data=PNG)
    with pytest.raises(NotFoundError):
        store.read(f"receipts/{expense_id}.jpg")
    store.delete(f"receipts/{expense_id}.jpg")
    assert connection.scalar(select(ReceiptImage.expense_id)) == expense_id


def test_deleting_the_expense_cascades_to_the_image(store, expense_id, client, alice):
    """Even if the service's delete-after-commit never ran, the bytes go."""
    _alice, headers = alice
    store.save(expense_id=expense_id, data=PNG)
    assert client.delete(f"/api/expenses/{expense_id}", headers=headers).status_code == 204
    with pytest.raises(NotFoundError):
        store.read(f"receipts/{expense_id}.png")
