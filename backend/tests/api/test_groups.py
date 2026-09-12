"""Group and membership endpoint tests."""

import uuid

import pytest


@pytest.fixture
def group(client, alice):
    _user, headers = alice
    response = client.post(
        "/api/groups",
        json={"name": "Dizengoff 5", "type": "SHARED_APARTMENT"},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json(), headers


def test_create_group_makes_creator_the_owner(group, alice):
    body, _ = group
    alice_user, _ = alice
    assert body["name"] == "Dizengoff 5"
    assert body["currency"] == "ILS"
    assert len(body["members"]) == 1
    assert body["members"][0]["user"]["id"] == alice_user["id"]
    assert body["members"][0]["role"] == "OWNER"


def test_create_group_rejects_unknown_type(client, alice):
    _user, headers = alice
    response = client.post("/api/groups", json={"name": "X", "type": "SPACESHIP"}, headers=headers)
    assert response.status_code == 422


def test_list_groups_only_returns_my_groups(client, group, bob):
    _bob_user, bob_headers = bob
    assert client.get("/api/groups", headers=bob_headers).json() == []

    _body, alice_headers = group
    assert len(client.get("/api/groups", headers=alice_headers).json()) == 1


def test_non_member_gets_403_on_every_group_route(client, group, bob):
    body, _ = group
    gid = body["id"]
    _bob_user, bob_headers = bob

    assert client.get(f"/api/groups/{gid}", headers=bob_headers).status_code == 403

    patched = client.patch(f"/api/groups/{gid}", json={"name": "Hijacked"}, headers=bob_headers)
    assert patched.status_code == 403

    assert client.delete(f"/api/groups/{gid}", headers=bob_headers).status_code == 403

    added = client.post(
        f"/api/groups/{gid}/members",
        json={"email": "bob@example.com"},
        headers=bob_headers,
    )
    assert added.status_code == 403


def test_missing_group_returns_404(client, alice):
    _user, headers = alice
    response = client.get(f"/api/groups/{uuid.uuid4()}", headers=headers)
    assert response.status_code == 404


def test_group_routes_require_authentication(client, group):
    body, _ = group
    assert client.get(f"/api/groups/{body['id']}").status_code == 401


def test_add_member_by_email(client, group, bob):
    body, headers = group
    bob_user, _ = bob
    response = client.post(
        f"/api/groups/{body['id']}/members",
        json={"email": "bob@example.com"},
        headers=headers,
    )
    assert response.status_code == 201
    assert response.json()["user"]["id"] == bob_user["id"]
    assert response.json()["role"] == "MEMBER"


def test_add_member_rejects_duplicate(client, group, bob):
    body, headers = group
    gid = body["id"]
    client.post(f"/api/groups/{gid}/members", json={"email": "bob@example.com"}, headers=headers)
    again = client.post(
        f"/api/groups/{gid}/members", json={"email": "bob@example.com"}, headers=headers
    )
    assert again.status_code == 409


def test_add_member_rejects_unknown_user(client, group):
    body, headers = group
    response = client.post(
        f"/api/groups/{body['id']}/members",
        json={"email": "ghost@example.com"},
        headers=headers,
    )
    assert response.status_code == 404


def test_add_member_requires_exactly_one_identifier(client, group):
    body, headers = group
    gid = body["id"]
    both = client.post(
        f"/api/groups/{gid}/members",
        json={"email": "bob@example.com", "user_id": str(uuid.uuid4())},
        headers=headers,
    )
    neither = client.post(f"/api/groups/{gid}/members", json={}, headers=headers)
    assert both.status_code == 422
    assert neither.status_code == 422


def test_update_member_weight(client, group, bob):
    body, headers = group
    bob_user, _ = bob
    gid = body["id"]
    client.post(f"/api/groups/{gid}/members", json={"email": "bob@example.com"}, headers=headers)
    response = client.patch(
        f"/api/groups/{gid}/members/{bob_user['id']}",
        json={"default_split_weight": "0.4"},
        headers=headers,
    )
    assert response.status_code == 200
    assert float(response.json()["default_split_weight"]) == 0.4


def test_update_member_rejects_non_positive_weight(client, group, bob):
    body, headers = group
    bob_user, _ = bob
    gid = body["id"]
    client.post(f"/api/groups/{gid}/members", json={"email": "bob@example.com"}, headers=headers)
    response = client.patch(
        f"/api/groups/{gid}/members/{bob_user['id']}",
        json={"default_split_weight": "0"},
        headers=headers,
    )
    assert response.status_code == 422


def test_removing_a_member_sets_left_at_and_keeps_the_row(client, group, bob):
    body, headers = group
    bob_user, bob_headers = bob
    gid = body["id"]
    client.post(f"/api/groups/{gid}/members", json={"email": "bob@example.com"}, headers=headers)

    removed = client.delete(f"/api/groups/{gid}/members/{bob_user['id']}", headers=headers)
    assert removed.status_code == 200
    assert removed.json()["left_at"] is not None

    # The row survives, so history stays intact...
    members = client.get(f"/api/groups/{gid}", headers=headers).json()["members"]
    assert any(m["user"]["id"] == bob_user["id"] for m in members)

    # ...but Bob has lost access, and the group is gone from his list.
    assert client.get(f"/api/groups/{gid}", headers=bob_headers).status_code == 403
    assert client.get("/api/groups", headers=bob_headers).json() == []


def test_a_member_who_left_can_be_re_added(client, group, bob):
    body, headers = group
    bob_user, bob_headers = bob
    gid = body["id"]
    client.post(f"/api/groups/{gid}/members", json={"email": "bob@example.com"}, headers=headers)
    client.delete(f"/api/groups/{gid}/members/{bob_user['id']}", headers=headers)

    rejoined = client.post(
        f"/api/groups/{gid}/members", json={"email": "bob@example.com"}, headers=headers
    )
    assert rejoined.status_code == 201
    assert rejoined.json()["left_at"] is None
    assert client.get(f"/api/groups/{gid}", headers=bob_headers).status_code == 200


def test_cannot_remove_the_last_owner(client, group, alice):
    body, headers = group
    alice_user, _ = alice
    response = client.delete(
        f"/api/groups/{body['id']}/members/{alice_user['id']}", headers=headers
    )
    assert response.status_code == 400


def test_a_member_can_remove_themselves(client, group, bob):
    body, headers = group
    bob_user, bob_headers = bob
    gid = body["id"]
    client.post(f"/api/groups/{gid}/members", json={"email": "bob@example.com"}, headers=headers)

    response = client.delete(f"/api/groups/{gid}/members/{bob_user['id']}", headers=bob_headers)
    assert response.status_code == 200


def test_a_plain_member_cannot_remove_someone_else(client, group, bob, make_user):
    body, headers = group
    _bob_user, bob_headers = bob
    carol_user, _ = make_user(email="carol@example.com", name="Carol")
    gid = body["id"]
    client.post(f"/api/groups/{gid}/members", json={"email": "bob@example.com"}, headers=headers)
    client.post(f"/api/groups/{gid}/members", json={"email": "carol@example.com"}, headers=headers)

    response = client.delete(f"/api/groups/{gid}/members/{carol_user['id']}", headers=bob_headers)
    assert response.status_code == 403


def test_only_owner_can_update_or_delete_group(client, group, bob):
    body, headers = group
    _bob_user, bob_headers = bob
    gid = body["id"]
    client.post(f"/api/groups/{gid}/members", json={"email": "bob@example.com"}, headers=headers)

    patched = client.patch(f"/api/groups/{gid}", json={"name": "Nope"}, headers=bob_headers)
    assert patched.status_code == 403
    assert client.delete(f"/api/groups/{gid}", headers=bob_headers).status_code == 403
    assert client.delete(f"/api/groups/{gid}", headers=headers).status_code == 204


def test_user_search_finds_by_email_fragment(client, alice, bob):
    _user, headers = alice
    results = client.get("/api/users/search?email=bob@", headers=headers).json()
    assert [u["email"] for u in results] == ["bob@example.com"]


def test_members_come_back_in_a_stable_order(client, group, bob, make_user):
    """The member list is a list, not a set.

    An unordered SELECT hands back heap order, and heap order changes the moment
    a row is rewritten -- so the same group could serve its members in a
    different order on two consecutive requests. The frontend reads position: the
    avatar stack, the payer filters and the split rows are all built by walking
    this list.
    """
    body, headers = group
    gid = body["id"]
    for email, name in (
        ("bob@example.com", "Bob"),
        ("carol@example.com", "Carol"),
        ("dan@example.com", "Dan"),
        ("erin@example.com", "Erin"),
    ):
        if email != "bob@example.com":
            make_user(email=email, name=name)
        added = client.post(f"/api/groups/{gid}/members", json={"email": email}, headers=headers)
        assert added.status_code == 201, added.text

    def member_ids() -> list[str]:
        response = client.get(f"/api/groups/{gid}", headers=headers)
        assert response.status_code == 200, response.text
        return [member["user"]["id"] for member in response.json()["members"]]

    before = member_ids()
    assert len(before) == 5

    # Every row here was written inside the test's single transaction, so
    # `joined_at` -- now(), the transaction's start time -- ties for all five and
    # the whole order falls to the tie-breaker. In production the timestamps
    # differ and this is join order.
    assert before == sorted(before)

    # Rewriting a row is what moves its tuple to the end of the heap, which is
    # how an unordered list reshuffles itself in the first place.
    patched = client.patch(
        f"/api/groups/{gid}/members/{before[0]}",
        json={"default_split_weight": "2"},
        headers=headers,
    )
    assert patched.status_code == 200, patched.text
    assert member_ids() == before
