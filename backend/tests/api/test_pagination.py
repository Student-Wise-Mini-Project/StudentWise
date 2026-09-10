"""Paged list endpoints.

The point of `total` is that a client can draw "showing 20 of 214" and decide
whether to render a next button without fetching everything, so these tests are
mostly about the total being right rather than the items being right.
"""

import pytest


@pytest.fixture
def flat(client, alice, bob):
    alice_user, headers = alice
    bob_user, _ = bob
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
    return {
        "group_id": group["id"],
        "headers": headers,
        "alice": alice_user,
        "bob": bob_user,
    }


def add_expenses(client, flat, count, **overrides):
    for i in range(count):
        payload = {
            "title": f"Expense {i}",
            "total_amount": "10.00",
            "expense_date": "2026-09-01",
            "payer_id": flat["alice"]["id"],
            "split_type": "EQUAL",
        }
        payload.update(overrides)
        response = client.post(
            f"/api/groups/{flat['group_id']}/expenses", json=payload, headers=flat["headers"]
        )
        assert response.status_code == 201, response.text


def get_page(client, flat, path, **params):
    query = "&".join(f"{k}={v}" for k, v in params.items())
    url = f"/api/groups/{flat['group_id']}/{path}"
    if query:
        url = f"{url}?{query}"
    response = client.get(url, headers=flat["headers"])
    assert response.status_code == 200, response.text
    return response.json()


# --- expenses ------------------------------------------------------------


def test_total_counts_beyond_the_page(client, flat):
    add_expenses(client, flat, 7)
    page = get_page(client, flat, "expenses", limit=3)
    assert len(page["items"]) == 3
    assert page["total"] == 7
    assert page["limit"] == 3
    assert page["offset"] == 0
    assert page["has_more"] is True


def test_offset_walks_through_without_repeating(client, flat):
    add_expenses(client, flat, 5)
    seen = []
    for offset in (0, 2, 4):
        page = get_page(client, flat, "expenses", limit=2, offset=offset)
        seen += [item["id"] for item in page["items"]]
    assert len(set(seen)) == 5


def test_the_last_page_is_not_flagged_as_having_more(client, flat):
    add_expenses(client, flat, 5)
    page = get_page(client, flat, "expenses", limit=2, offset=4)
    assert len(page["items"]) == 1
    assert page["has_more"] is False


def test_an_empty_group_pages_cleanly(client, flat):
    page = get_page(client, flat, "expenses")
    assert page == {"items": [], "total": 0, "limit": 50, "offset": 0, "has_more": False}


def test_the_total_honours_every_filter(client, flat):
    add_expenses(client, flat, 4, category="GROCERIES")
    add_expenses(client, flat, 2, category="UTILITIES")

    page = get_page(client, flat, "expenses", limit=1, category="UTILITIES")
    assert page["total"] == 2, "a total built from unfiltered rows is worse than no total"

    page = get_page(client, flat, "expenses", limit=1, payer_id=flat["bob"]["id"])
    assert page["total"] == 0


def test_offset_past_the_end_still_reports_the_total(client, flat):
    add_expenses(client, flat, 3)
    page = get_page(client, flat, "expenses", limit=5, offset=99)
    assert page["items"] == []
    assert page["total"] == 3


# --- settlements ---------------------------------------------------------


def test_settlements_are_paged_the_same_way(client, flat):
    for _ in range(3):
        response = client.post(
            f"/api/groups/{flat['group_id']}/settlements",
            json={
                "from_user_id": flat["bob"]["id"],
                "to_user_id": flat["alice"]["id"],
                "amount": "5.00",
            },
            headers=flat["headers"],
        )
        assert response.status_code == 201, response.text

    page = get_page(client, flat, "settlements", limit=2)
    assert len(page["items"]) == 2
    assert page["total"] == 3
    assert page["has_more"] is True
