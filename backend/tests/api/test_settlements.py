"""Settlement endpoint tests."""

import uuid
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
        "alice": alice_user,
        "bob": bob_user,
        "carol": carol_user,
        "bob_headers": bob_headers,
    }


def post_settlement(client, flat, **overrides):
    payload = {
        "from_user_id": flat["bob"]["id"],
        "to_user_id": flat["alice"]["id"],
        "amount": "25.00",
    }
    payload.update(overrides)
    return client.post(
        f"/api/groups/{flat['group_id']}/settlements", json=payload, headers=flat["headers"]
    )


def test_recording_a_repayment(client, flat):
    response = post_settlement(client, flat)
    assert response.status_code == 201, response.text
    body = response.json()
    assert Decimal(body["amount"]) == Decimal("25.00")
    assert body["from_user"]["email"] == "bob@example.com"
    assert body["to_user"]["email"] == "alice@example.com"
    assert body["method"] == "MANUAL"


def test_settlements_are_listed_for_the_group(client, flat):
    created = post_settlement(client, flat).json()
    page = client.get(f"/api/groups/{flat['group_id']}/settlements", headers=flat["headers"]).json()
    assert [s["id"] for s in page["items"]] == [created["id"]]
    assert page["total"] == 1


def test_paying_yourself_is_rejected(client, flat):
    response = post_settlement(
        client, flat, from_user_id=flat["bob"]["id"], to_user_id=flat["bob"]["id"]
    )
    assert response.status_code == 400


def test_non_positive_amount_is_rejected(client, flat):
    assert post_settlement(client, flat, amount="0.00").status_code == 422
    assert post_settlement(client, flat, amount="-5.00").status_code == 422


def test_both_people_must_belong_to_the_group(client, flat, make_user):
    outsider, _ = make_user(email="dave@example.com", name="Dave")
    assert post_settlement(client, flat, from_user_id=outsider["id"]).status_code == 400
    assert post_settlement(client, flat, to_user_id=outsider["id"]).status_code == 400


def test_someone_who_left_can_still_be_paid_back(client, flat):
    """Leaving a group does not erase the debt, so repayment must still work."""
    gid, headers = flat["group_id"], flat["headers"]
    client.delete(f"/api/groups/{gid}/members/{flat['bob']['id']}", headers=headers)
    response = post_settlement(client, flat)
    assert response.status_code == 201


def test_bit_and_paybox_methods_are_accepted(client, flat):
    for method in ("BIT", "PAYBOX"):
        response = post_settlement(client, flat, method=method)
        assert response.status_code == 201
        assert response.json()["method"] == method


def test_unknown_method_is_rejected(client, flat):
    assert post_settlement(client, flat, method="CASH_UNDER_THE_TABLE").status_code == 422


def test_outsider_cannot_list_or_create(client, flat, make_user):
    _outsider, outsider_headers = make_user(email="dave@example.com", name="Dave")
    gid = flat["group_id"]
    assert client.get(f"/api/groups/{gid}/settlements", headers=outsider_headers).status_code == 403
    created = client.post(
        f"/api/groups/{gid}/settlements",
        json={
            "from_user_id": flat["bob"]["id"],
            "to_user_id": flat["alice"]["id"],
            "amount": "5.00",
        },
        headers=outsider_headers,
    )
    assert created.status_code == 403


def test_get_and_delete_a_settlement(client, flat):
    created = post_settlement(client, flat).json()
    url = f"/api/settlements/{created['id']}"
    headers = flat["headers"]

    assert client.get(url, headers=headers).status_code == 200
    assert client.delete(url, headers=headers).status_code == 204
    assert client.get(url, headers=headers).status_code == 404


def test_missing_settlement_returns_404(client, flat):
    response = client.get(f"/api/settlements/{uuid.uuid4()}", headers=flat["headers"])
    assert response.status_code == 404


def test_outsider_cannot_delete_a_settlement(client, flat, make_user):
    created = post_settlement(client, flat).json()
    _outsider, outsider_headers = make_user(email="dave@example.com", name="Dave")
    response = client.delete(f"/api/settlements/{created['id']}", headers=outsider_headers)
    assert response.status_code == 403


def test_deleting_a_group_removes_its_settlements(client, db, flat):
    from sqlalchemy import func, select

    from app.models.settlement import Settlement

    post_settlement(client, flat)
    assert db.scalar(select(func.count()).select_from(Settlement)) == 1

    client.delete(f"/api/groups/{flat['group_id']}", headers=flat["headers"])
    assert db.scalar(select(func.count()).select_from(Settlement)) == 0
