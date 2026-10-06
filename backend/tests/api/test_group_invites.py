"""Invite links: share a link, and whoever opens it joins the group.

The way in for someone with no account yet. What has to hold: the token is
unguessable, a link stops working when it expires or is replaced, opening one
shows nothing about the group's members or money, and joining twice is
harmless.
"""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import update

from app.models.group_invite import GroupInvite


@pytest.fixture
def flat(client, alice, bob):
    """Alice's flat, with Bob in it and one expense."""
    alice_user, headers = alice
    _, bob_headers = bob
    group = client.post(
        "/api/groups", json={"name": "Dizengoff 5", "type": "SHARED_APARTMENT"}, headers=headers
    ).json()
    client.post(
        f"/api/groups/{group['id']}/members", json={"email": "bob@example.com"}, headers=headers
    )
    client.post(
        f"/api/groups/{group['id']}/expenses",
        json={
            "title": "Rent",
            "total_amount": "3600.00",
            "expense_date": "2026-10-01",
            "payer_id": alice_user["id"],
            "split_type": "EQUAL",
        },
        headers=headers,
    )
    return {"id": group["id"], "headers": headers, "bob_headers": bob_headers}


def share(client, flat, headers=None, **body):
    return client.post(
        f"/api/groups/{flat['id']}/invites", json=body, headers=headers or flat["headers"]
    )


def members(client, flat):
    group = client.get(f"/api/groups/{flat['id']}", headers=flat["headers"]).json()
    return sorted(m["user"]["name"] for m in group["members"] if m["left_at"] is None)


# --- sharing a link -----------------------------------------------------------------


def test_any_member_can_share_the_groups_link(client, flat):
    response = share(client, flat, headers=flat["bob_headers"])
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["group_id"] == flat["id"]
    assert len(body["token"]) >= 32  # unguessable


def test_sharing_again_gives_the_same_link_until_renewed(client, flat):
    first = share(client, flat).json()["token"]
    assert share(client, flat, headers=flat["bob_headers"]).json()["token"] == first

    renewed = share(client, flat, renew=True).json()["token"]
    assert renewed != first
    # The old link stopped working the moment it was replaced.
    assert client.get(f"/api/invites/{first}", headers=flat["headers"]).status_code == 404


def test_a_link_lasts_14_days(client, flat):
    expires = datetime.fromisoformat(share(client, flat).json()["expires_at"])
    assert timedelta(days=13, hours=23) < expires - datetime.now(UTC) <= timedelta(days=14)


def test_outsiders_cannot_get_a_groups_link(client, flat, make_user):
    _, eve = make_user(email="eve@example.com", name="Eve")
    assert share(client, flat, headers=eve).status_code == 403


def test_a_closed_group_shares_no_link(client, flat):
    client.post(f"/api/groups/{flat['id']}/close", headers=flat["headers"])
    assert share(client, flat).status_code == 409


def test_a_link_can_be_retired(client, flat, make_user):
    token = share(client, flat).json()["token"]
    assert (
        client.delete(f"/api/groups/{flat['id']}/invites", headers=flat["headers"]).status_code
        == 204
    )
    _, carol = make_user(email="carol@example.com", name="Carol")
    assert client.post(f"/api/invites/{token}/accept", headers=carol).status_code == 404


# --- opening and joining ----------------------------------------------------------------


def test_opening_a_link_shows_the_group_and_who_invited_and_nothing_more(client, flat, make_user):
    token = share(client, flat, headers=flat["bob_headers"]).json()["token"]
    _, carol = make_user(email="carol@example.com", name="Carol")

    response = client.get(f"/api/invites/{token}", headers=carol)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["group_name"] == "Dizengoff 5"
    assert body["invited_by"] == "Bob"
    assert body["already_member"] is False
    assert body["is_open"] is True
    # No members, no money, before joining.
    assert set(body) == {
        "group_id", "group_name", "group_type", "invited_by", "expires_at",
        "already_member", "is_open",
    }  # fmt: skip
    assert client.get(f"/api/groups/{flat['id']}", headers=carol).status_code == 403


def test_opening_a_link_needs_an_account(client, flat):
    token = share(client, flat).json()["token"]
    assert client.get(f"/api/invites/{token}").status_code == 401
    assert client.post(f"/api/invites/{token}/accept").status_code == 401


def test_accepting_joins_the_group(client, flat, make_user):
    token = share(client, flat).json()["token"]
    _, carol = make_user(email="carol@example.com", name="Carol")

    response = client.post(f"/api/invites/{token}/accept", headers=carol)
    assert response.status_code == 200, response.text
    assert response.json() == {"group_id": flat["id"]}
    assert members(client, flat) == ["Alice", "Bob", "Carol"]
    # And now the group is theirs to see.
    assert client.get(f"/api/groups/{flat['id']}", headers=carol).status_code == 200


def test_one_link_lets_several_people_join(client, flat, make_user):
    token = share(client, flat).json()["token"]
    for email, name in [("carol@example.com", "Carol"), ("dan@example.com", "Dan")]:
        _, headers = make_user(email=email, name=name)
        assert client.post(f"/api/invites/{token}/accept", headers=headers).status_code == 200
    assert members(client, flat) == ["Alice", "Bob", "Carol", "Dan"]


def test_accepting_twice_or_as_a_member_is_harmless(client, flat):
    token = share(client, flat).json()["token"]
    preview = client.get(f"/api/invites/{token}", headers=flat["bob_headers"]).json()
    assert preview["already_member"] is True
    for _ in range(2):
        assert (
            client.post(f"/api/invites/{token}/accept", headers=flat["bob_headers"]).status_code
            == 200
        )
    assert members(client, flat) == ["Alice", "Bob"]


def test_someone_who_left_rejoins_with_their_history(client, flat):
    bob_id = client.get("/api/auth/me", headers=flat["bob_headers"]).json()["id"]
    client.delete(f"/api/groups/{flat['id']}/members/{bob_id}", headers=flat["headers"])
    assert members(client, flat) == ["Alice"]

    token = share(client, flat).json()["token"]
    assert (
        client.post(f"/api/invites/{token}/accept", headers=flat["bob_headers"]).status_code == 200
    )
    assert members(client, flat) == ["Alice", "Bob"]


@pytest.mark.parametrize("token", ["nope", "x" * 32])
def test_an_unknown_link_is_not_valid(client, flat, token):
    response = client.get(f"/api/invites/{token}", headers=flat["headers"])
    assert response.status_code == 404
    assert "no longer valid" in response.json()["detail"]


def test_an_expired_link_says_the_same_as_an_unknown_one(client, db, flat, make_user):
    token = share(client, flat).json()["token"]
    db.execute(
        update(GroupInvite)
        .where(GroupInvite.token == token)
        .values(expires_at=datetime.now(UTC) - timedelta(minutes=1))
    )
    db.flush()
    _, carol = make_user(email="carol@example.com", name="Carol")
    response = client.post(f"/api/invites/{token}/accept", headers=carol)
    assert response.status_code == 404
    assert "no longer valid" in response.json()["detail"]


def test_a_group_closed_after_sharing_takes_nobody_new(client, flat, make_user):
    token = share(client, flat).json()["token"]
    client.post(f"/api/groups/{flat['id']}/close", headers=flat["headers"])
    _, carol = make_user(email="carol@example.com", name="Carol")

    assert client.get(f"/api/invites/{token}", headers=carol).json()["is_open"] is False
    assert client.post(f"/api/invites/{token}/accept", headers=carol).status_code == 409


def test_deleting_the_group_takes_its_links_with_it(client, db, flat):
    share(client, flat)
    assert client.delete(f"/api/groups/{flat['id']}", headers=flat["headers"]).status_code == 204
    assert db.query(GroupInvite).count() == 0
