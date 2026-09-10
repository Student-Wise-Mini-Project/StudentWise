"""Idempotency-key tests.

The scenario being defended against: a phone on the underground sends an
expense, the reply never arrives, the app retries. Without a key that is two
rent payments.
"""

import uuid

import pytest

from app.models.idempotency import IdempotencyKey
from app.models.user import User
from app.services import idempotency_service


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
    return {
        "group_id": group["id"],
        "headers": headers,
        "bob_headers": bob_headers,
        "alice": alice_user,
        "bob": bob_user,
    }


def post_expense(client, flat, *, key=None, headers=None, **overrides):
    payload = {
        "title": "September rent",
        "total_amount": "3600.00",
        "expense_date": "2026-09-01",
        "payer_id": flat["alice"]["id"],
        "split_type": "EQUAL",
    }
    payload.update(overrides)
    request_headers = dict(headers or flat["headers"])
    if key is not None:
        request_headers["Idempotency-Key"] = key
    return client.post(
        f"/api/groups/{flat['group_id']}/expenses", json=payload, headers=request_headers
    )


def count_expenses(client, flat) -> int:
    return client.get(f"/api/groups/{flat['group_id']}/expenses", headers=flat["headers"]).json()[
        "total"
    ]


# --- the retry that must not double-charge --------------------------------


def test_the_same_key_and_body_creates_one_expense(client, flat):
    first = post_expense(client, flat, key="abc-123")
    second = post_expense(client, flat, key="abc-123")

    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert first.json()["id"] == second.json()["id"]
    assert count_expenses(client, flat) == 1


def test_the_replay_returns_the_whole_original(client, flat):
    """Not just the id -- a retrying client needs the same answer it missed."""
    first = post_expense(client, flat, key="abc-123").json()
    second = post_expense(client, flat, key="abc-123").json()
    assert first == second


def test_retrying_many_times_still_makes_one(client, flat):
    for _ in range(5):
        assert post_expense(client, flat, key="abc-123").status_code == 201
    assert count_expenses(client, flat) == 1


def test_without_a_key_nothing_is_deduplicated(client, flat):
    """The header is opt-in. Two deliberate identical expenses are allowed --
    people really do buy the same coffee twice."""
    post_expense(client, flat)
    post_expense(client, flat)
    assert count_expenses(client, flat) == 2


def test_different_keys_create_different_expenses(client, flat):
    post_expense(client, flat, key="one")
    post_expense(client, flat, key="two")
    assert count_expenses(client, flat) == 2


# --- misuse ---------------------------------------------------------------


def test_reusing_a_key_for_a_different_body_is_refused(client, flat):
    """Answering with the first request's expense would hide a client bug and
    silently drop the second expense."""
    post_expense(client, flat, key="abc-123", total_amount="3600.00")
    response = post_expense(client, flat, key="abc-123", total_amount="99.00")

    assert response.status_code == 409
    assert "different request" in response.json()["detail"]
    assert count_expenses(client, flat) == 1


def test_a_key_is_private_to_one_person(client, flat):
    """Two people picking "1" must not collide, and one must never reach the
    other's expense by guessing a key."""
    mine = post_expense(client, flat, key="1")
    theirs = post_expense(client, flat, key="1", headers=flat["bob_headers"])

    assert mine.status_code == 201
    assert theirs.status_code == 201
    assert mine.json()["id"] != theirs.json()["id"]
    assert count_expenses(client, flat) == 2


def test_the_same_key_in_another_group_is_a_different_request(client, flat):
    other = client.post(
        "/api/groups", json={"name": "Eilat", "type": "TRIP"}, headers=flat["headers"]
    ).json()

    first = post_expense(client, flat, key="shared")
    second = client.post(
        f"/api/groups/{other['id']}/expenses",
        json={
            "title": "September rent",
            "total_amount": "3600.00",
            "expense_date": "2026-09-01",
            "payer_id": flat["alice"]["id"],
            "split_type": "EQUAL",
        },
        headers={**flat["headers"], "Idempotency-Key": "shared"},
    )
    assert second.status_code == 201, second.text
    assert first.json()["id"] != second.json()["id"]


def test_a_failed_request_creates_nothing(client, flat):
    failed = post_expense(
        client, flat, key="abc-123", payer_id="00000000-0000-0000-0000-000000000000"
    )
    assert failed.status_code == 400, failed.text
    assert count_expenses(client, flat) == 0


def test_a_key_is_released_when_its_transaction_rolls_back(db, alice):
    """Fixing a typo and pressing send again has to work.

    The release is not special-cased anywhere -- the key row is written inside
    the transaction it protects, so a rejected request takes its key down with
    it. That is exactly what is exercised here.

    It is tested at this level rather than through the client because the test
    harness deliberately runs every request of a test inside **one** shared
    transaction, so a failed request never reaches a rollback the way a real one
    does. Asserting it through the client would prove the harness, not the code.
    """
    user = db.get(User, uuid.UUID(alice[0]["id"]))

    savepoint = db.begin_nested()
    claimed = idempotency_service.claim(
        db, user=user, scope="expenses:x", key="abc-123", request_fingerprint="first-body"
    )
    assert isinstance(claimed, IdempotencyKey)
    savepoint.rollback()

    # The key is free again, and free even for a different body -- there is no
    # record left of the request that failed.
    again = idempotency_service.claim(
        db, user=user, scope="expenses:x", key="abc-123", request_fingerprint="second-body"
    )
    assert isinstance(again, IdempotencyKey)


def test_an_absurdly_long_key_is_rejected(client, flat):
    assert post_expense(client, flat, key="x" * 201).status_code == 422


# --- settlements get the same protection ----------------------------------


def test_a_repayment_is_not_recorded_twice(client, flat):
    body = {
        "from_user_id": flat["bob"]["id"],
        "to_user_id": flat["alice"]["id"],
        "amount": "50.00",
    }
    headers = {**flat["headers"], "Idempotency-Key": "pay-1"}

    first = client.post(f"/api/groups/{flat['group_id']}/settlements", json=body, headers=headers)
    second = client.post(f"/api/groups/{flat['group_id']}/settlements", json=body, headers=headers)

    assert first.status_code == 201, first.text
    assert first.json()["id"] == second.json()["id"]

    listed = client.get(
        f"/api/groups/{flat['group_id']}/settlements", headers=flat["headers"]
    ).json()
    assert listed["total"] == 1


def test_a_replayed_expense_does_not_notify_twice(client, flat):
    """The notification is written in the same transaction as the expense, so a
    replay that creates no expense must raise no second alert either."""
    post_expense(client, flat, key="abc-123")
    post_expense(client, flat, key="abc-123")

    unread = client.get("/api/notifications/unread-count", headers=flat["bob_headers"]).json()
    assert unread["unread"] == 1
