"""Activity-feed tests.

The feed is what a home screen is made of, so the things worth proving are that
it mixes both kinds of event in the right order and that it never shows a group
you are not in.
"""

import pytest


@pytest.fixture
def two_groups(client, alice, bob, make_user):
    """Alice is in a flat with Bob and on a trip with Carol. Dave is elsewhere."""
    alice_user, headers = alice
    bob_user, bob_headers = bob
    carol_user, _ = make_user(email="carol@example.com", name="Carol")

    flat = client.post(
        "/api/groups", json={"name": "Dizengoff 5", "type": "SHARED_APARTMENT"}, headers=headers
    ).json()
    client.post(
        f"/api/groups/{flat['id']}/members", json={"email": "bob@example.com"}, headers=headers
    )

    trip = client.post(
        "/api/groups", json={"name": "Eilat", "type": "TRIP"}, headers=headers
    ).json()
    client.post(
        f"/api/groups/{trip['id']}/members", json={"email": "carol@example.com"}, headers=headers
    )

    return {
        "flat_id": flat["id"],
        "trip_id": trip["id"],
        "headers": headers,
        "bob_headers": bob_headers,
        "alice": alice_user,
        "bob": bob_user,
        "carol": carol_user,
    }


def add_expense(client, ctx, group_id, title, payer=None):
    response = client.post(
        f"/api/groups/{group_id}/expenses",
        json={
            "title": title,
            "total_amount": "100.00",
            "expense_date": "2026-09-01",
            "payer_id": payer or ctx["alice"]["id"],
            "split_type": "EQUAL",
        },
        headers=ctx["headers"],
    )
    assert response.status_code == 201, response.text
    return response.json()


def add_settlement(client, ctx, group_id, from_id, to_id, amount="20.00"):
    response = client.post(
        f"/api/groups/{group_id}/settlements",
        json={"from_user_id": from_id, "to_user_id": to_id, "amount": amount},
        headers=ctx["headers"],
    )
    assert response.status_code == 201, response.text
    return response.json()


def feed(client, ctx, headers=None, **params):
    query = "&".join(f"{k}={v}" for k, v in params.items())
    url = "/api/activity" + (f"?{query}" if query else "")
    response = client.get(url, headers=headers or ctx["headers"])
    assert response.status_code == 200, response.text
    return response.json()


# --- what the feed contains ----------------------------------------------


def test_the_feed_mixes_expenses_and_settlements_newest_first(client, two_groups):
    add_expense(client, two_groups, two_groups["flat_id"], "Groceries")
    add_settlement(
        client,
        two_groups,
        two_groups["flat_id"],
        two_groups["bob"]["id"],
        two_groups["alice"]["id"],
    )
    add_expense(client, two_groups, two_groups["trip_id"], "Hotel")

    page = feed(client, two_groups)
    kinds = [item["kind"] for item in page["items"]]
    assert kinds == ["EXPENSE_ADDED", "SETTLEMENT_RECORDED", "EXPENSE_ADDED"]
    assert page["items"][0]["expense"]["title"] == "Hotel"
    assert page["total"] == 3


def test_an_item_carries_the_whole_row(client, two_groups):
    """So a home screen can render and open a row without a second request."""
    add_expense(client, two_groups, two_groups["flat_id"], "Groceries")
    item = feed(client, two_groups)["items"][0]

    assert item["group_name"] == "Dizengoff 5"
    assert item["currency"] == "ILS"
    assert item["expense"]["title"] == "Groceries"
    assert len(item["expense"]["splits"]) == 2
    assert item["settlement"] is None


def test_a_settlement_item_names_both_people(client, two_groups):
    add_settlement(
        client,
        two_groups,
        two_groups["flat_id"],
        two_groups["bob"]["id"],
        two_groups["alice"]["id"],
    )
    item = feed(client, two_groups)["items"][0]
    assert item["expense"] is None
    assert item["settlement"]["from_user"]["email"] == "bob@example.com"
    assert item["settlement"]["to_user"]["email"] == "alice@example.com"


# --- isolation -----------------------------------------------------------


def test_the_feed_only_shows_groups_you_are_in(client, two_groups, make_user):
    add_expense(client, two_groups, two_groups["flat_id"], "Groceries")
    add_expense(client, two_groups, two_groups["trip_id"], "Hotel")

    # Bob is in the flat but not on the trip.
    titles = [
        item["expense"]["title"]
        for item in feed(client, two_groups, headers=two_groups["bob_headers"])["items"]
    ]
    assert titles == ["Groceries"]


def test_an_outsider_sees_an_empty_feed(client, two_groups, make_user):
    add_expense(client, two_groups, two_groups["flat_id"], "Groceries")
    _dave, dave_headers = make_user(email="dave@example.com", name="Dave")
    page = feed(client, two_groups, headers=dave_headers)
    assert page["items"] == []
    assert page["total"] == 0


def test_leaving_a_group_takes_it_out_of_your_feed(client, two_groups):
    """The expenses themselves are untouched -- they still count towards the
    group's balances. They just stop being your news."""
    add_expense(client, two_groups, two_groups["flat_id"], "Groceries")
    client.delete(
        f"/api/groups/{two_groups['flat_id']}/members/{two_groups['bob']['id']}",
        headers=two_groups["headers"],
    )
    assert feed(client, two_groups, headers=two_groups["bob_headers"])["items"] == []
    assert len(feed(client, two_groups)["items"]) == 1


def test_the_feed_requires_authentication(client):
    assert client.get("/api/activity").status_code == 401


# --- paging --------------------------------------------------------------


def test_the_feed_pages_across_both_tables(client, two_groups):
    for i in range(3):
        add_expense(client, two_groups, two_groups["flat_id"], f"Expense {i}")
    for _ in range(2):
        add_settlement(
            client,
            two_groups,
            two_groups["flat_id"],
            two_groups["bob"]["id"],
            two_groups["alice"]["id"],
        )

    first = feed(client, two_groups, limit=2)
    second = feed(client, two_groups, limit=2, offset=2)
    third = feed(client, two_groups, limit=2, offset=4)

    assert first["total"] == 5
    assert first["has_more"] is True
    assert third["has_more"] is False

    def ids(page):
        return [(i["expense"] or i["settlement"])["id"] for i in page["items"]]

    everything = ids(first) + ids(second) + ids(third)
    assert len(everything) == 5
    assert len(set(everything)) == 5, "a page boundary must not repeat or skip a row"


# --- the group-scoped variant --------------------------------------------


def test_a_group_feed_shows_only_that_group(client, two_groups):
    add_expense(client, two_groups, two_groups["flat_id"], "Groceries")
    add_expense(client, two_groups, two_groups["trip_id"], "Hotel")

    response = client.get(
        f"/api/groups/{two_groups['trip_id']}/activity", headers=two_groups["headers"]
    )
    assert response.status_code == 200, response.text
    page = response.json()
    assert [i["expense"]["title"] for i in page["items"]] == ["Hotel"]
    assert page["total"] == 1


def test_an_outsider_cannot_read_a_group_feed(client, two_groups, make_user):
    _dave, dave_headers = make_user(email="dave@example.com", name="Dave")
    response = client.get(f"/api/groups/{two_groups['flat_id']}/activity", headers=dave_headers)
    assert response.status_code == 403
