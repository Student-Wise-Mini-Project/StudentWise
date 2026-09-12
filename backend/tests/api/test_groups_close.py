"""Closing a group, and what a closed group refuses.

Closing is not deleting. A trip that ended should stop taking new spending
without losing a single expense in it, and -- because closing is deliberately
allowed while money is still outstanding -- the debts inside it have to stay
payable afterwards. That last point is what most of this file is about.
"""

import pytest


@pytest.fixture
def flat(client, alice, bob):
    """A group with two members, owned by Alice."""
    _alice_user, headers = alice
    bob_user, bob_headers = bob

    group = client.post(
        "/api/groups",
        json={"name": "Dizengoff 5", "type": "SHARED_APARTMENT"},
        headers=headers,
    ).json()
    client.post(
        f"/api/groups/{group['id']}/members",
        json={"email": "bob@example.com"},
        headers=headers,
    )

    alice_user, _ = alice
    return {
        "group_id": group["id"],
        "headers": headers,
        "alice": alice_user,
        "bob": bob_user,
        "bob_headers": bob_headers,
    }


@pytest.fixture
def closed_flat(client, flat):
    response = client.post(f"/api/groups/{flat['group_id']}/close", headers=flat["headers"])
    assert response.status_code == 200, response.text
    return flat


# --- the two verbs ----------------------------------------------------------


def test_close_sets_archived_at(client, flat):
    response = client.post(f"/api/groups/{flat['group_id']}/close", headers=flat["headers"])
    assert response.status_code == 200
    assert response.json()["archived_at"] is not None


def test_reopen_clears_archived_at(client, closed_flat):
    response = client.post(
        f"/api/groups/{closed_flat['group_id']}/reopen", headers=closed_flat["headers"]
    )
    assert response.status_code == 200
    assert response.json()["archived_at"] is None


def test_closing_twice_is_a_conflict(client, closed_flat):
    response = client.post(
        f"/api/groups/{closed_flat['group_id']}/close", headers=closed_flat["headers"]
    )
    assert response.status_code == 409


def test_reopening_an_open_group_is_a_conflict(client, flat):
    response = client.post(f"/api/groups/{flat['group_id']}/reopen", headers=flat["headers"])
    assert response.status_code == 409


def test_only_an_owner_can_close(client, flat):
    response = client.post(f"/api/groups/{flat['group_id']}/close", headers=flat["bob_headers"])
    assert response.status_code == 403


def test_only_an_owner_can_reopen(client, closed_flat):
    response = client.post(
        f"/api/groups/{closed_flat['group_id']}/reopen", headers=closed_flat["bob_headers"]
    )
    assert response.status_code == 403


# --- what a closed group refuses --------------------------------------------
#
# The allowlist, not a blanket read-only flag. A closed group takes no new
# spending; everything that resolves an existing debt stays open.


def _expense_payload(flat):
    return {
        "title": "Beer",
        "total_amount": "40.00",
        "payer_id": flat["alice"]["id"],
        "split_type": "EQUAL",
        "expense_date": "2026-09-12",
    }


def test_a_closed_group_takes_no_new_expenses(client, closed_flat):
    response = client.post(
        f"/api/groups/{closed_flat['group_id']}/expenses",
        json=_expense_payload(closed_flat),
        headers=closed_flat["headers"],
    )
    assert response.status_code == 409


def test_a_closed_group_takes_no_edits_to_old_expenses(client, flat):
    expense = client.post(
        f"/api/groups/{flat['group_id']}/expenses",
        json=_expense_payload(flat),
        headers=flat["headers"],
    ).json()
    client.post(f"/api/groups/{flat['group_id']}/close", headers=flat["headers"])

    patched = client.patch(
        f"/api/expenses/{expense['id']}",
        json={"title": "Wine"},
        headers=flat["headers"],
    )
    assert patched.status_code == 409

    deleted = client.delete(f"/api/expenses/{expense['id']}", headers=flat["headers"])
    assert deleted.status_code == 409


def test_a_closed_group_still_takes_settlements(client, flat):
    """The whole point of warning rather than blocking.

    A group may close owing money, and that money has to stay payable or the
    warning the client shows is a trap.
    """
    client.post(
        f"/api/groups/{flat['group_id']}/expenses",
        json=_expense_payload(flat),
        headers=flat["headers"],
    )
    client.post(f"/api/groups/{flat['group_id']}/close", headers=flat["headers"])

    response = client.post(
        f"/api/groups/{flat['group_id']}/settlements",
        json={
            "from_user_id": flat["bob"]["id"],
            "to_user_id": flat["alice"]["id"],
            "amount": "20.00",
        },
        headers=flat["headers"],
    )
    assert response.status_code == 201, response.text


def test_a_closed_group_takes_no_new_members(client, closed_flat, make_user):
    make_user(email="carol@example.com", name="Carol")
    response = client.post(
        f"/api/groups/{closed_flat['group_id']}/members",
        json={"email": "carol@example.com"},
        headers=closed_flat["headers"],
    )
    assert response.status_code == 409


def test_a_closed_group_takes_no_new_recurring_bills(client, closed_flat):
    response = client.post(
        f"/api/groups/{closed_flat['group_id']}/recurring-bills",
        json={
            "title": "Rent",
            "frequency": "MONTHLY",
            "first_due_on": "2026-10-01",
            "payer_id": closed_flat["alice"]["id"],
            "amount": "3600.00",
        },
        headers=closed_flat["headers"],
    )
    assert response.status_code == 409


def test_running_due_bills_on_a_closed_group_is_a_no_op(client, closed_flat):
    """The client calls this on every group open. A 409 here would make a
    closed group impossible to look at."""
    response = client.post(
        f"/api/groups/{closed_flat['group_id']}/recurring-bills/run",
        headers=closed_flat["headers"],
    )
    assert response.status_code == 200
    body = response.json()
    assert body["generated"] == []
    assert body["awaiting_amount"] == []
    assert body["reminded"] == []


def test_a_closed_group_is_still_fully_readable(client, closed_flat):
    gid = closed_flat["group_id"]
    headers = closed_flat["headers"]
    assert client.get(f"/api/groups/{gid}", headers=headers).status_code == 200
    assert client.get(f"/api/groups/{gid}/balances", headers=headers).status_code == 200
    assert client.get(f"/api/groups/{gid}/expenses", headers=headers).status_code == 200
    assert client.get(f"/api/groups/{gid}/settlement-plan", headers=headers).status_code == 200


def test_leaving_a_closed_group_still_works(client, closed_flat):
    """Closing a group must not trap the people in it."""
    response = client.delete(
        f"/api/groups/{closed_flat['group_id']}/members/{closed_flat['bob']['id']}",
        headers=closed_flat["bob_headers"],
    )
    assert response.status_code == 200


def test_a_closed_group_can_still_be_deleted(client, closed_flat):
    response = client.delete(
        f"/api/groups/{closed_flat['group_id']}", headers=closed_flat["headers"]
    )
    assert response.status_code == 204
