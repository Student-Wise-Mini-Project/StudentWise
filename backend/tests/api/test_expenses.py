"""Expense endpoint tests."""

import uuid
from decimal import Decimal

import pytest


@pytest.fixture
def flat(client, alice, bob, make_user):
    """A shared apartment with Alice (owner), Bob and Carol."""
    alice_user, headers = alice
    bob_user, bob_headers = bob
    carol_user, carol_headers = make_user(email="carol@example.com", name="Carol")

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
        "alice": alice_user,
        "bob": bob_user,
        "carol": carol_user,
        "bob_headers": bob_headers,
        "carol_headers": carol_headers,
    }


def post_expense(client, flat, **overrides):
    payload = {
        "title": "Groceries",
        "total_amount": "100.00",
        "expense_date": "2026-09-01",
        "payer_id": flat["alice"]["id"],
        "split_type": "EQUAL",
    }
    payload.update(overrides)
    return client.post(
        f"/api/groups/{flat['group_id']}/expenses", json=payload, headers=flat["headers"]
    )


def owed(body) -> dict[str, Decimal]:
    return {s["user"]["email"]: Decimal(s["owed_amount"]) for s in body["splits"]}


# --- creating ------------------------------------------------------------


def test_omitting_participants_includes_everyone(client, flat):
    response = post_expense(client, flat)
    assert response.status_code == 201, response.text
    body = response.json()
    assert len(body["splits"]) == 3
    assert sum(owed(body).values()) == Decimal("100.00")


def test_expense_can_cover_only_some_of_the_group(client, flat):
    """The headline requirement: upload an expense only some members are part of."""
    response = post_expense(client, flat, participants=[{"user_id": flat["bob"]["id"]}])
    assert response.status_code == 201
    body = response.json()
    assert len(body["splits"]) == 1
    assert owed(body) == {"bob@example.com": Decimal("100.00")}


def test_two_of_three_share_an_expense(client, flat):
    response = post_expense(
        client,
        flat,
        participants=[{"user_id": flat["bob"]["id"]}, {"user_id": flat["carol"]["id"]}],
    )
    body = response.json()
    assert owed(body) == {
        "bob@example.com": Decimal("50.00"),
        "carol@example.com": Decimal("50.00"),
    }


def test_equal_split_of_100_among_3_sums_exactly(client, flat):
    body = post_expense(client, flat).json()
    assert sorted(owed(body).values()) == [
        Decimal("33.33"),
        Decimal("33.33"),
        Decimal("33.34"),
    ]
    assert sum(owed(body).values()) == Decimal("100.00")


def test_exact_split(client, flat):
    body = post_expense(
        client,
        flat,
        split_type="EXACT",
        participants=[
            {"user_id": flat["alice"]["id"], "share_value": "70.50"},
            {"user_id": flat["bob"]["id"], "share_value": "29.50"},
        ],
    ).json()
    assert owed(body) == {
        "alice@example.com": Decimal("70.50"),
        "bob@example.com": Decimal("29.50"),
    }


def test_exact_split_that_misses_the_total_is_rejected(client, flat):
    response = post_expense(
        client,
        flat,
        split_type="EXACT",
        participants=[
            {"user_id": flat["alice"]["id"], "share_value": "70.00"},
            {"user_id": flat["bob"]["id"], "share_value": "20.00"},
        ],
    )
    assert response.status_code == 400


def test_percentage_split(client, flat):
    body = post_expense(
        client,
        flat,
        split_type="PERCENTAGE",
        participants=[
            {"user_id": flat["alice"]["id"], "share_value": "60"},
            {"user_id": flat["bob"]["id"], "share_value": "40"},
        ],
    ).json()
    assert owed(body) == {
        "alice@example.com": Decimal("60.00"),
        "bob@example.com": Decimal("40.00"),
    }


def test_weight_split_falls_back_to_member_default_weights(client, flat):
    """Weights default to group_members.default_split_weight when not supplied."""
    gid, headers = flat["group_id"], flat["headers"]
    client.patch(
        f"/api/groups/{gid}/members/{flat['alice']['id']}",
        json={"default_split_weight": "3"},
        headers=headers,
    )
    client.patch(
        f"/api/groups/{gid}/members/{flat['bob']['id']}",
        json={"default_split_weight": "1"},
        headers=headers,
    )
    body = post_expense(
        client,
        flat,
        split_type="WEIGHT",
        participants=[{"user_id": flat["alice"]["id"]}, {"user_id": flat["bob"]["id"]}],
    ).json()
    assert owed(body) == {
        "alice@example.com": Decimal("75.00"),
        "bob@example.com": Decimal("25.00"),
    }


def test_participant_outside_the_group_is_rejected(client, flat, make_user):
    outsider, _ = make_user(email="dave@example.com", name="Dave")
    response = post_expense(client, flat, participants=[{"user_id": outsider["id"]}])
    assert response.status_code == 400


def test_a_member_who_left_cannot_join_a_new_split(client, flat):
    gid, headers = flat["group_id"], flat["headers"]
    client.delete(f"/api/groups/{gid}/members/{flat['bob']['id']}", headers=headers)
    response = post_expense(client, flat, participants=[{"user_id": flat["bob"]["id"]}])
    assert response.status_code == 400


def test_payer_must_be_a_group_member(client, flat, make_user):
    outsider, _ = make_user(email="dave@example.com", name="Dave")
    response = post_expense(client, flat, payer_id=outsider["id"])
    assert response.status_code == 400


def test_non_positive_total_is_rejected(client, flat):
    assert post_expense(client, flat, total_amount="0.00").status_code == 422


def test_creating_an_expense_requires_membership(client, flat, make_user):
    _outsider, outsider_headers = make_user(email="dave@example.com", name="Dave")
    response = client.post(
        f"/api/groups/{flat['group_id']}/expenses",
        json={
            "title": "Sneaky",
            "total_amount": "10.00",
            "expense_date": "2026-09-01",
            "payer_id": flat["alice"]["id"],
        },
        headers=outsider_headers,
    )
    assert response.status_code == 403


# --- reading -------------------------------------------------------------


def test_list_and_get_expenses(client, flat):
    created = post_expense(client, flat).json()
    listed = client.get(f"/api/groups/{flat['group_id']}/expenses", headers=flat["headers"]).json()
    assert [e["id"] for e in listed] == [created["id"]]

    fetched = client.get(f"/api/expenses/{created['id']}", headers=flat["headers"]).json()
    assert fetched["title"] == "Groceries"
    assert fetched["payer"]["email"] == "alice@example.com"


def test_list_filters_by_category(client, flat):
    post_expense(client, flat, category="super")
    post_expense(client, flat, title="Electricity", category="bills")
    listed = client.get(
        f"/api/groups/{flat['group_id']}/expenses?category=bills", headers=flat["headers"]
    ).json()
    assert [e["title"] for e in listed] == ["Electricity"]


def test_outsider_cannot_read_an_expense(client, flat, make_user):
    created = post_expense(client, flat).json()
    _outsider, outsider_headers = make_user(email="dave@example.com", name="Dave")
    response = client.get(f"/api/expenses/{created['id']}", headers=outsider_headers)
    assert response.status_code == 403


def test_missing_expense_returns_404(client, flat):
    response = client.get(f"/api/expenses/{uuid.uuid4()}", headers=flat["headers"])
    assert response.status_code == 404


# --- updating ------------------------------------------------------------


def test_changing_the_total_recomputes_splits(client, flat):
    created = post_expense(client, flat).json()
    updated = client.patch(
        f"/api/expenses/{created['id']}",
        json={"total_amount": "60.00"},
        headers=flat["headers"],
    ).json()
    assert sum(owed(updated).values()) == Decimal("60.00")
    assert set(owed(updated).values()) == {Decimal("20.00")}


def test_changing_the_total_keeps_the_original_participants(client, flat):
    """Editing an expense shared by two of three must not spread it to everyone."""
    created = post_expense(
        client,
        flat,
        participants=[{"user_id": flat["bob"]["id"]}, {"user_id": flat["carol"]["id"]}],
    ).json()
    updated = client.patch(
        f"/api/expenses/{created['id']}",
        json={"total_amount": "50.00"},
        headers=flat["headers"],
    ).json()
    assert set(owed(updated)) == {"bob@example.com", "carol@example.com"}
    assert sum(owed(updated).values()) == Decimal("50.00")


def test_switching_to_exact_replaces_splits_rather_than_appending(client, flat):
    created = post_expense(client, flat).json()
    assert len(created["splits"]) == 3

    updated = client.patch(
        f"/api/expenses/{created['id']}",
        json={
            "split_type": "EXACT",
            "participants": [
                {"user_id": flat["alice"]["id"], "share_value": "80.00"},
                {"user_id": flat["bob"]["id"], "share_value": "20.00"},
            ],
        },
        headers=flat["headers"],
    ).json()
    assert len(updated["splits"]) == 2
    assert owed(updated) == {
        "alice@example.com": Decimal("80.00"),
        "bob@example.com": Decimal("20.00"),
    }


def test_editing_only_the_title_leaves_splits_alone(client, flat):
    created = post_expense(client, flat).json()
    updated = client.patch(
        f"/api/expenses/{created['id']}",
        json={"title": "Shufersal run"},
        headers=flat["headers"],
    ).json()
    assert updated["title"] == "Shufersal run"
    assert owed(updated) == owed(created)


def test_any_member_can_edit_an_expense(client, flat):
    created = post_expense(client, flat).json()
    response = client.patch(
        f"/api/expenses/{created['id']}",
        json={"title": "Edited by Bob"},
        headers=flat["bob_headers"],
    )
    assert response.status_code == 200


# --- deleting ------------------------------------------------------------


def test_deleting_an_expense_removes_it_and_its_splits(client, db, flat):
    from sqlalchemy import func, select

    from app.models.expense import ExpenseSplit

    created = post_expense(client, flat).json()
    assert db.scalar(select(func.count()).select_from(ExpenseSplit)) == 3

    assert (
        client.delete(f"/api/expenses/{created['id']}", headers=flat["headers"]).status_code == 204
    )
    assert client.get(f"/api/expenses/{created['id']}", headers=flat["headers"]).status_code == 404
    assert db.scalar(select(func.count()).select_from(ExpenseSplit)) == 0


def test_outsider_cannot_delete_an_expense(client, flat, make_user):
    created = post_expense(client, flat).json()
    _outsider, outsider_headers = make_user(email="dave@example.com", name="Dave")
    response = client.delete(f"/api/expenses/{created['id']}", headers=outsider_headers)
    assert response.status_code == 403
