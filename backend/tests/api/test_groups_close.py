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
