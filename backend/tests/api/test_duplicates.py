"""Duplicate-report endpoint tests.

The scoring itself is covered in `tests/unit/test_duplicates.py`. These are
about the endpoint: what it reports, what it refuses to report, and the fact
that it changes nothing.
"""

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


def add(client, flat, title, amount, day, payer=None):
    response = client.post(
        f"/api/groups/{flat['group_id']}/expenses",
        json={
            "title": title,
            "total_amount": amount,
            "expense_date": f"2026-09-{day:02d}",
            "payer_id": payer or flat["alice"]["id"],
            "split_type": "EQUAL",
        },
        headers=flat["headers"],
    )
    assert response.status_code == 201, response.text
    return response.json()


def report(client, flat, headers=None, **params):
    query = "&".join(f"{k}={v}" for k, v in params.items())
    url = f"/api/groups/{flat['group_id']}/analytics/duplicates"
    if query:
        url = f"{url}?{query}"
    response = client.get(url, headers=headers or flat["headers"])
    assert response.status_code == 200, response.text
    return response.json()


# --- what it finds --------------------------------------------------------


def test_two_people_paying_the_same_bill_is_reported(client, flat):
    first = add(client, flat, "Electricity bill", "412.00", 3, payer=flat["alice"]["id"])
    second = add(client, flat, "Electricity bill", "412.00", 4, payer=flat["bob"]["id"])

    body = report(client, flat)
    assert len(body["pairs"]) == 1
    pair = body["pairs"][0]

    assert {pair["first"]["id"], pair["second"]["id"]} == {first["id"], second["id"]}
    assert pair["same_payer"] is False
    assert pair["day_gap"] == 1
    assert pair["first"]["payer"]["email"] == "alice@example.com"
    assert pair["second"]["payer"]["email"] == "bob@example.com"


def test_the_report_says_why(client, flat):
    """A confidence number on its own is not something anyone can act on."""
    add(client, flat, "Shufersal", "89.90", 3)
    add(client, flat, "Shufersal", "89.90", 3)

    reasons = report(client, flat)["pairs"][0]["reasons"]
    assert any("exactly 89.90" in r for r in reasons)
    assert any("same day" in r.lower() for r in reasons)
    assert any("same person" in r.lower() for r in reasons)


def test_the_earlier_expense_is_named_first(client, flat):
    earlier = add(client, flat, "Water bill", "150.00", 2)
    later = add(client, flat, "Water bill", "150.00", 4)

    pair = report(client, flat)["pairs"][0]
    assert pair["first"]["id"] == earlier["id"]
    assert pair["second"]["id"] == later["id"]


def test_the_currency_and_window_come_back(client, flat):
    body = report(client, flat)
    assert body["currency"] == "ILS"
    assert body["window_days"] == 3
    assert body["group_id"] == flat["group_id"]


# --- what it must not find ------------------------------------------------


def test_a_monthly_bill_is_not_reported_against_itself(client, flat):
    """Six months of electricity is six payments, not fifteen duplicates."""
    for month in range(3, 9):
        client.post(
            f"/api/groups/{flat['group_id']}/expenses",
            json={
                "title": "Electricity bill",
                "total_amount": "412.00",
                "expense_date": f"2026-{month:02d}-05",
                "payer_id": flat["alice"]["id"],
                "split_type": "EQUAL",
            },
            headers=flat["headers"],
        )
    assert report(client, flat)["pairs"] == []


def test_different_things_at_the_same_price_are_not_duplicates(client, flat):
    add(client, flat, "Taxi to the airport", "50.00", 3)
    add(client, flat, "Pizza night", "50.00", 3)
    assert report(client, flat)["pairs"] == []


def test_an_empty_group_reports_nothing(client, flat):
    assert report(client, flat)["pairs"] == []


# --- tuning ---------------------------------------------------------------


def test_the_window_can_be_widened(client, flat):
    add(client, flat, "Electricity bill", "412.00", 1)
    add(client, flat, "Electricity bill", "412.00", 8)

    assert report(client, flat)["pairs"] == []
    assert len(report(client, flat, window_days=10)["pairs"]) == 1


def test_the_confidence_floor_can_be_raised(client, flat):
    add(client, flat, "Electricity bill", "412.00", 3)
    add(client, flat, "Electricity bill", "412.00", 6)

    assert len(report(client, flat)["pairs"]) == 1
    assert report(client, flat, min_score=0.95)["pairs"] == []


@pytest.mark.parametrize(
    "params",
    [{"window_days": -1}, {"window_days": 400}, {"min_score": 2}, {"min_score": -0.5}],
)
def test_nonsense_tuning_is_refused(client, flat, params):
    query = "&".join(f"{k}={v}" for k, v in params.items())
    response = client.get(
        f"/api/groups/{flat['group_id']}/analytics/duplicates?{query}", headers=flat["headers"]
    )
    assert response.status_code == 422


def test_dates_narrow_the_report_but_not_the_search(client, flat):
    """A duplicate straddles dates. Filtering the history first would hide the
    pairs at either edge of the window being asked about."""
    add(client, flat, "Electricity bill", "412.00", 30)
    client.post(
        f"/api/groups/{flat['group_id']}/expenses",
        json={
            "title": "Electricity bill",
            "total_amount": "412.00",
            "expense_date": "2026-10-01",
            "payer_id": flat["bob"]["id"],
            "split_type": "EQUAL",
        },
        headers=flat["headers"],
    )

    # The pair spans the month boundary and is reported from either side.
    assert len(report(client, flat, date_from="2026-10-01")["pairs"]) == 1
    assert len(report(client, flat, date_to="2026-09-30")["pairs"]) == 1
    assert report(client, flat, date_from="2026-11-01")["pairs"] == []


# --- isolation and safety -------------------------------------------------


def test_the_report_stops_at_the_group_boundary(client, flat, make_user):
    add(client, flat, "Electricity bill", "412.00", 3)

    outsider, outsider_headers = make_user(email="dave@example.com", name="Dave")
    other = client.post(
        "/api/groups", json={"name": "Other", "type": "TRIP"}, headers=outsider_headers
    ).json()
    client.post(
        f"/api/groups/{other['id']}/expenses",
        json={
            "title": "Electricity bill",
            "total_amount": "412.00",
            "expense_date": "2026-09-03",
            "payer_id": outsider["id"],
            "split_type": "EQUAL",
        },
        headers=outsider_headers,
    )
    assert report(client, flat)["pairs"] == []


def test_the_report_changes_nothing(client, flat):
    """Suggestions only. Two coffees at 12.00 on the same day look exactly like
    a double tap and are not one."""
    add(client, flat, "Coffee", "12.00", 3)
    add(client, flat, "Coffee", "12.00", 3)

    assert len(report(client, flat)["pairs"]) == 1
    listed = client.get(f"/api/groups/{flat['group_id']}/expenses", headers=flat["headers"]).json()
    assert listed["total"] == 2


def test_an_outsider_cannot_read_the_report(client, flat, make_user):
    _dave, dave_headers = make_user(email="dave@example.com", name="Dave")
    response = client.get(
        f"/api/groups/{flat['group_id']}/analytics/duplicates", headers=dave_headers
    )
    assert response.status_code == 403


def test_the_report_requires_authentication(client, flat):
    response = client.get(f"/api/groups/{flat['group_id']}/analytics/duplicates")
    assert response.status_code == 401
