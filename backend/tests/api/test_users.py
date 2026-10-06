"""Your phone number (7.3), and who gets to see it."""

import pytest


def _set_phone(client, headers, phone):
    return client.patch("/api/users/me", json={"phone_number": phone}, headers=headers)


def test_setting_a_phone_number_stores_it_canonically(client, alice):
    _user, headers = alice
    response = _set_phone(client, headers, "050-123 4567")
    assert response.status_code == 200, response.text
    assert response.json()["phone_number"] == "+972501234567"
    assert client.get("/api/auth/me", headers=headers).json()["phone_number"] == "+972501234567"


@pytest.mark.parametrize("cleared", [None, "", "   "])
def test_a_phone_number_can_be_removed(client, alice, cleared):
    _user, headers = alice
    _set_phone(client, headers, "0501234567")
    response = _set_phone(client, headers, cleared)
    assert response.status_code == 200, response.text
    assert response.json()["phone_number"] is None


@pytest.mark.parametrize("bad", ["03-1234567", "12345", "not a number", "+1 415 555 0100"])
def test_a_number_that_is_not_an_israeli_mobile_is_refused(client, alice, bad):
    _user, headers = alice
    _set_phone(client, headers, "0501234567")
    response = _set_phone(client, headers, bad)
    assert response.status_code == 422
    # The old number survives a rejected change.
    assert client.get("/api/auth/me", headers=headers).json()["phone_number"] == "+972501234567"


def test_the_landline_refusal_says_why(client, alice):
    _user, headers = alice
    detail = _set_phone(client, headers, "03-1234567").json()["detail"]
    assert "mobile" in str(detail)


def test_the_field_must_be_sent(client, alice):
    # Leaving it out is not the same as removing it; a client that forgot the
    # field must not wipe the number.
    _user, headers = alice
    assert client.patch("/api/users/me", json={}, headers=headers).status_code == 422


def test_changing_your_profile_needs_a_token(client):
    assert client.patch("/api/users/me", json={"phone_number": None}).status_code == 401


def test_you_only_change_your_own_number(client, alice, bob):
    _alice, alice_headers = alice
    _bob, bob_headers = bob
    _set_phone(client, bob_headers, "0527654321")
    _set_phone(client, alice_headers, "0501234567")
    assert client.get("/api/auth/me", headers=bob_headers).json()["phone_number"] == "+972527654321"


def test_sign_up_validates_and_normalises_the_number(client):
    response = client.post(
        "/api/auth/register",
        json={
            "name": "Carol",
            "email": "carol@example.com",
            "password": "password123",
            "phone_number": "+972 54 765 4321",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["user"]["phone_number"] == "+972547654321"


def test_sign_up_refuses_a_bad_number(client):
    response = client.post(
        "/api/auth/register",
        json={
            "name": "Carol",
            "email": "carol@example.com",
            "password": "password123",
            "phone_number": "03-1234567",
        },
    )
    assert response.status_code == 422


def test_sign_up_treats_a_blank_number_as_none(client):
    response = client.post(
        "/api/auth/register",
        json={
            "name": "Carol",
            "email": "carol@example.com",
            "password": "password123",
            "phone_number": "",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["user"]["phone_number"] is None


def test_search_never_shows_a_phone_number(client, alice, bob):
    # Search reaches every account in the app, not just your groups.
    _bob, bob_headers = bob
    _set_phone(client, bob_headers, "0527654321")
    _alice, alice_headers = alice

    hits = client.get("/api/users/search", params={"email": "bob@"}, headers=alice_headers).json()
    assert [hit["email"] for hit in hits] == ["bob@example.com"]
    assert "phone_number" not in hits[0]


def test_people_in_your_group_see_your_number(client, alice, bob):
    # That is the point of it: they pay you back with it.
    _bob, bob_headers = bob
    _set_phone(client, bob_headers, "0527654321")
    _alice, alice_headers = alice
    group = client.post(
        "/api/groups", json={"name": "Flat", "type": "SHARED_APARTMENT"}, headers=alice_headers
    ).json()
    client.post(
        f"/api/groups/{group['id']}/members",
        json={"email": "bob@example.com"},
        headers=alice_headers,
    )

    members = client.get(f"/api/groups/{group['id']}", headers=alice_headers).json()["members"]
    phones = {m["user"]["email"]: m["user"]["phone_number"] for m in members}
    assert phones["bob@example.com"] == "+972527654321"
