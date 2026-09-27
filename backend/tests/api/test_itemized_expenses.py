"""An expense split line by line, as from a scanned receipt.

What has to hold: the lines decide who owes what, and the result is an ordinary
EXACT split. Everything that reads money -- balances, settle-up, analytics --
must see nothing it has not seen before.
"""

from decimal import Decimal

import pytest


@pytest.fixture
def flat(client, alice, bob, make_user):
    alice_user, headers = alice
    bob_user, bob_headers = bob
    carol_user, _ = make_user(email="carol@example.com", name="Carol")

    group = client.post(
        "/api/groups",
        json={"name": "Dizengoff 5", "type": "SHARED_APARTMENT"},
        headers=headers,
    ).json()
    for email in ("bob@example.com", "carol@example.com"):
        client.post(f"/api/groups/{group['id']}/members", json={"email": email}, headers=headers)

    return {
        "group_id": group["id"],
        "headers": headers,
        "bob_headers": bob_headers,
        "alice": alice_user,
        "bob": bob_user,
        "carol": carol_user,
    }


def receipt(flat, *, total="60.00", items=None, **overrides):
    body = {
        "title": "Shufersal",
        "total_amount": total,
        "expense_date": "2026-09-20",
        "payer_id": flat["alice"]["id"],
        "split_type": "EXACT",
        "category": "GROCERIES",
        "source": "OCR",
        "items": items
        if items is not None
        else [
            {"name": "Milk", "amount": "30.00", "user_ids": []},
            {"name": "Wine", "amount": "20.00", "user_ids": [flat["alice"]["id"]]},
            {
                "name": "Hummus",
                "amount": "10.00",
                "user_ids": [flat["bob"]["id"], flat["carol"]["id"]],
            },
        ],
    }
    body.update(overrides)
    return body


def create(client, flat, body, headers=None):
    return client.post(
        f"/api/groups/{flat['group_id']}/expenses", json=body, headers=headers or flat["headers"]
    )


def owed_by_email(expense) -> dict[str, Decimal]:
    return {s["user"]["email"]: Decimal(s["owed_amount"]) for s in expense["splits"]}


# --- creating ---------------------------------------------------------------


def test_lines_decide_who_owes_what(client, flat):
    response = create(client, flat, receipt(flat))
    assert response.status_code == 201, response.text
    expense = response.json()

    # Milk 30 between three, wine 20 for Alice, hummus 10 between Bob and Carol.
    assert owed_by_email(expense) == {
        "alice@example.com": Decimal("30.00"),
        "bob@example.com": Decimal("15.00"),
        "carol@example.com": Decimal("15.00"),
    }
    assert expense["split_type"] == "EXACT"
    assert expense["source"] == "OCR"


def test_lines_come_back_in_receipt_order_with_their_people(client, flat):
    expense = create(client, flat, receipt(flat)).json()

    assert [(i["name"], i["amount"]) for i in expense["items"]] == [
        ("Milk", "30.00"),
        ("Wine", "20.00"),
        ("Hummus", "10.00"),
    ]
    people = [{u["email"] for u in item["users"]} for item in expense["items"]]
    # An unmarked line is stored with everybody named, not with nobody.
    assert people[0] == {"alice@example.com", "bob@example.com", "carol@example.com"}
    assert people[1] == {"alice@example.com"}
    assert people[2] == {"bob@example.com", "carol@example.com"}


def test_a_discount_is_shared_in_proportion(client, flat):
    # Lines come to 60, the receipt says 54: a 10% discount for everyone.
    expense = create(client, flat, receipt(flat, total="54.00")).json()
    assert owed_by_email(expense) == {
        "alice@example.com": Decimal("27.00"),
        "bob@example.com": Decimal("13.50"),
        "carol@example.com": Decimal("13.50"),
    }


def test_the_splits_add_up_to_the_total_when_nothing_divides_evenly(client, flat):
    items = [{"name": "Bread", "amount": "10.00", "user_ids": []}]
    expense = create(client, flat, receipt(flat, total="10.01", items=items)).json()
    assert sum(owed_by_email(expense).values()) == Decimal("10.01")


def test_someone_on_no_line_is_not_on_the_expense(client, flat):
    items = [{"name": "Wine", "amount": "20.00", "user_ids": [flat["alice"]["id"]]}]
    expense = create(client, flat, receipt(flat, total="20.00", items=items)).json()
    assert set(owed_by_email(expense)) == {"alice@example.com"}


def test_ocr_metadata_is_kept(client, flat):
    metadata = {"merchant": "Shufersal Deal", "category_text": "סופרמרקט", "edited": True}
    expense = create(client, flat, receipt(flat, ai_metadata=metadata)).json()
    assert expense["ai_metadata"] == metadata


def test_an_ordinary_expense_has_no_items(client, flat):
    expense = create(
        client,
        flat,
        {
            "title": "Pizza",
            "total_amount": "30.00",
            "expense_date": "2026-09-20",
            "payer_id": flat["alice"]["id"],
        },
    ).json()
    assert expense["items"] == []


# --- nothing downstream can tell ------------------------------------------


def test_balances_see_an_ordinary_expense(client, flat):
    create(client, flat, receipt(flat))
    body = client.get(f"/api/groups/{flat['group_id']}/balances", headers=flat["headers"]).json()
    net = {b["user"]["email"]: Decimal(b["net"]) for b in body["balances"]}

    # Alice paid 60 and owes 30.
    assert net == {
        "alice@example.com": Decimal("30.00"),
        "bob@example.com": Decimal("-15.00"),
        "carol@example.com": Decimal("-15.00"),
    }


def test_retrying_with_the_same_key_creates_one_expense(client, flat):
    headers = {**flat["headers"], "Idempotency-Key": "receipt-1"}
    first = create(client, flat, receipt(flat), headers=headers)
    second = create(client, flat, receipt(flat), headers=headers)
    assert first.json()["id"] == second.json()["id"]

    listed = client.get(f"/api/groups/{flat['group_id']}/expenses", headers=flat["headers"]).json()
    assert listed["total"] == 1


# --- editing ----------------------------------------------------------------


def test_editing_the_title_keeps_the_lines(client, flat):
    expense = create(client, flat, receipt(flat)).json()
    updated = client.patch(
        f"/api/expenses/{expense['id']}", json={"title": "Weekly shop"}, headers=flat["headers"]
    ).json()
    assert len(updated["items"]) == 3
    assert owed_by_email(updated) == owed_by_email(expense)


def test_changing_the_split_drops_the_lines_that_no_longer_explain_it(client, flat):
    expense = create(client, flat, receipt(flat)).json()
    updated = client.patch(
        f"/api/expenses/{expense['id']}",
        json={"split_type": "EQUAL", "participants": [{"user_id": flat["alice"]["id"]}]},
        headers=flat["headers"],
    ).json()
    assert updated["items"] == []
    assert owed_by_email(updated) == {"alice@example.com": Decimal("60.00")}


def test_deleting_the_expense_deletes_its_lines(client, flat, db):
    from app.models.expense_item import ExpenseItem, ItemSplit

    expense = create(client, flat, receipt(flat)).json()
    client.delete(f"/api/expenses/{expense['id']}", headers=flat["headers"])
    assert db.query(ExpenseItem).count() == 0
    assert db.query(ItemSplit).count() == 0


# --- what is refused ----------------------------------------------------------


def test_items_with_participants_is_refused(client, flat):
    body = receipt(flat, participants=[{"user_id": flat["alice"]["id"]}])
    assert create(client, flat, body).status_code == 422


def test_items_need_an_exact_split_type(client, flat):
    assert create(client, flat, receipt(flat, split_type="EQUAL")).status_code == 422


def test_an_empty_list_of_lines_is_refused(client, flat):
    assert create(client, flat, receipt(flat, items=[])).status_code == 422


def test_a_line_for_someone_outside_the_group_is_refused(client, flat, make_user):
    stranger, _ = make_user(email="mallory@example.com", name="Mallory")
    items = [{"name": "Wine", "amount": "60.00", "user_ids": [stranger["id"]]}]
    response = create(client, flat, receipt(flat, items=items))
    assert response.status_code == 400
    assert "not an active member" in response.json()["detail"]


@pytest.mark.parametrize("amount", ["0.00", "-5.00"])
def test_a_line_that_is_not_positive_is_refused(client, flat, amount):
    items = [{"name": "Discount", "amount": amount, "user_ids": []}]
    assert create(client, flat, receipt(flat, items=items)).status_code == 422


def test_oversized_metadata_is_refused(client, flat):
    body = receipt(flat, ai_metadata={"raw": "x" * 20_000})
    assert create(client, flat, body).status_code == 422


def test_a_closed_group_takes_no_receipts(client, flat):
    client.post(f"/api/groups/{flat['group_id']}/close", headers=flat["headers"])
    assert create(client, flat, receipt(flat)).status_code == 409


# --- preview ----------------------------------------------------------------


def preview(client, flat, *, total="60.00", items=None, headers=None):
    body = receipt(flat, total=total, items=items)
    return client.post(
        f"/api/groups/{flat['group_id']}/expenses/item-preview",
        json={"total_amount": body["total_amount"], "items": body["items"]},
        headers=headers or flat["headers"],
    )


def test_preview_matches_what_saving_stores(client, flat):
    previewed = preview(client, flat, total="54.00").json()
    saved = create(client, flat, receipt(flat, total="54.00")).json()

    by_id = {s["user_id"]: s["owed_amount"] for s in previewed["splits"]}
    assert by_id == {s["user"]["id"]: s["owed_amount"] for s in saved["splits"]}
    assert previewed["items_total"] == "60.00"
    assert previewed["adjustment"] == "-6.00"


def test_preview_writes_nothing(client, flat):
    preview(client, flat)
    listed = client.get(f"/api/groups/{flat['group_id']}/expenses", headers=flat["headers"]).json()
    assert listed["total"] == 0


def test_preview_is_for_members_only(client, flat, make_user):
    _, stranger_headers = make_user(email="mallory@example.com", name="Mallory")
    assert preview(client, flat, headers=stranger_headers).status_code in (403, 404)


def test_preview_reports_bad_lines_like_saving_does(client, flat, make_user):
    stranger, _ = make_user(email="mallory@example.com", name="Mallory")
    items = [{"name": "Wine", "amount": "60.00", "user_ids": [stranger["id"]]}]
    assert preview(client, flat, items=items).status_code == 400
