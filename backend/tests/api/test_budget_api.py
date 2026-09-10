"""Budget endpoint tests.

The thresholds themselves are covered in `tests/unit/test_budgets.py`. These are
about the endpoint and, mostly, about the alerts: an alert that fires once per
expense is an alert nobody reads by the end of the month.
"""

import pytest


@pytest.fixture
def flat(client, alice, bob, make_user):
    alice_user, headers = alice
    bob_user, bob_headers = bob
    carol_user, carol_headers = make_user(email="carol@example.com", name="Carol")

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
        "carol_headers": carol_headers,
    }


def make_budget(client, flat, *, amount="1000.00", category="GROCERIES", headers=None):
    payload = {"amount": amount}
    if category is not None:
        payload["category"] = category
    return client.post(
        f"/api/groups/{flat['group_id']}/budgets",
        json=payload,
        headers=headers or flat["headers"],
    )


def spend(client, flat, amount, *, category="GROCERIES", day=5, month=9, title="Shufersal"):
    response = client.post(
        f"/api/groups/{flat['group_id']}/expenses",
        json={
            "title": title,
            "total_amount": amount,
            "expense_date": f"2026-{month:02d}-{day:02d}",
            "payer_id": flat["alice"]["id"],
            "split_type": "EQUAL",
            **({"category": category} if category else {}),
        },
        headers=flat["headers"],
    )
    assert response.status_code == 201, response.text
    return response.json()


def report(client, flat, month="2026-09", headers=None):
    response = client.get(
        f"/api/groups/{flat['group_id']}/budgets?month={month}",
        headers=headers or flat["headers"],
    )
    assert response.status_code == 200, response.text
    return response.json()


def alerts(client, headers):
    body = client.get("/api/notifications", headers=headers).json()
    return [n for n in body["items"] if n["kind"].startswith("BUDGET_")]


# --- keeping budgets ------------------------------------------------------


def test_a_budget_is_created(client, flat):
    response = make_budget(client, flat)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["category"] == "GROCERIES"
    assert body["amount"] == "1000.00"
    assert body["period"] == "MONTHLY"


def test_only_an_owner_can_set_one(client, flat):
    assert make_budget(client, flat, headers=flat["bob_headers"]).status_code == 403


def test_every_member_can_read_the_report(client, flat):
    make_budget(client, flat)
    assert report(client, flat, headers=flat["carol_headers"])["budgets"]


def test_two_budgets_for_one_category_are_refused(client, flat):
    make_budget(client, flat)
    assert make_budget(client, flat).status_code == 409


def test_two_overall_budgets_are_refused(client, flat):
    assert make_budget(client, flat, category=None).status_code == 201
    assert make_budget(client, flat, category=None).status_code == 409


def test_a_budget_must_be_positive(client, flat):
    assert make_budget(client, flat, amount="0.00").status_code == 422
    assert make_budget(client, flat, amount="-5.00").status_code == 422


def test_a_budget_can_be_changed_and_removed(client, flat):
    budget = make_budget(client, flat).json()

    updated = client.patch(
        f"/api/groups/{flat['group_id']}/budgets/{budget['id']}",
        json={"amount": "1500.00"},
        headers=flat["headers"],
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["amount"] == "1500.00"

    assert (
        client.delete(
            f"/api/groups/{flat['group_id']}/budgets/{budget['id']}", headers=flat["headers"]
        ).status_code
        == 204
    )
    assert report(client, flat)["budgets"] == []


# --- the report -----------------------------------------------------------


def test_the_report_counts_what_the_group_spent(client, flat):
    """Expense totals, not one person's share -- a budget is a ceiling on what
    leaves the household."""
    make_budget(client, flat, amount="1000.00")
    spend(client, flat, "300.00")

    status = report(client, flat)["budgets"][0]
    assert status["spent"] == "300.00"
    assert status["remaining"] == "700.00"
    assert status["share_used"] == "30.0"
    assert status["level"] == "OK"


def test_the_report_is_per_month(client, flat):
    make_budget(client, flat, amount="1000.00")
    spend(client, flat, "300.00", month=9)
    spend(client, flat, "800.00", month=10)

    assert report(client, flat, month="2026-09")["budgets"][0]["spent"] == "300.00"
    assert report(client, flat, month="2026-10")["budgets"][0]["spent"] == "800.00"
    assert report(client, flat, month="2026-11")["budgets"][0]["spent"] == "0.00"


def test_going_over_shows_a_negative_remainder(client, flat):
    make_budget(client, flat, amount="1000.00")
    spend(client, flat, "1250.50")

    status = report(client, flat)["budgets"][0]
    assert status["remaining"] == "-250.50"
    assert status["level"] == "EXCEEDED"


def test_a_budget_only_counts_its_own_category(client, flat):
    make_budget(client, flat, category="GROCERIES", amount="1000.00")
    spend(client, flat, "900.00", category="RENT")
    assert report(client, flat)["budgets"][0]["spent"] == "0.00"


def test_the_overall_budget_counts_everything(client, flat):
    make_budget(client, flat, category=None, amount="5000.00")
    spend(client, flat, "900.00", category="RENT")
    spend(client, flat, "100.00", category="GROCERIES")
    assert report(client, flat)["budgets"][0]["spent"] == "1000.00"


def test_an_other_budget_picks_up_uncategorised_spending(client, flat):
    """Analytics folds uncategorised expenses into OTHER. Two different unknown
    buckets would be one more thing to reconcile by hand."""
    make_budget(client, flat, category="OTHER", amount="500.00")
    spend(client, flat, "100.00", category="OTHER")
    spend(client, flat, "50.00", category=None)
    assert report(client, flat)["budgets"][0]["spent"] == "150.00"


def test_a_malformed_month_is_refused(client, flat):
    response = client.get(
        f"/api/groups/{flat['group_id']}/budgets?month=September", headers=flat["headers"]
    )
    assert response.status_code == 422


# --- alerts ---------------------------------------------------------------


def test_crossing_eighty_percent_warns_everyone(client, flat):
    """Including whoever spent the money -- they are best placed to stop."""
    make_budget(client, flat, amount="1000.00")
    spend(client, flat, "850.00")

    for headers in (flat["headers"], flat["bob_headers"], flat["carol_headers"]):
        found = alerts(client, headers)
        assert len(found) == 1
        assert found[0]["kind"] == "BUDGET_WARNING"
        assert "close to its GROCERIES budget" in found[0]["title"]
        assert "850.00" in found[0]["body"]


def test_staying_under_says_nothing(client, flat):
    make_budget(client, flat, amount="1000.00")
    spend(client, flat, "300.00")
    assert alerts(client, flat["bob_headers"]) == []


def test_the_alert_fires_once_not_once_per_expense(client, flat):
    """The twelfth notification about the same blown budget is one nobody
    reads."""
    make_budget(client, flat, amount="1000.00")
    for _ in range(5):
        spend(client, flat, "300.00")

    found = alerts(client, flat["bob_headers"])
    assert len(found) == 2, "one warning, then one when it was actually exceeded"
    assert {n["kind"] for n in found} == {"BUDGET_WARNING", "BUDGET_EXCEEDED"}


def test_going_straight_past_the_limit_skips_the_warning(client, flat):
    make_budget(client, flat, amount="1000.00")
    spend(client, flat, "2000.00")

    found = alerts(client, flat["bob_headers"])
    assert len(found) == 1
    assert found[0]["kind"] == "BUDGET_EXCEEDED"


def test_a_new_month_is_news_again(client, flat):
    make_budget(client, flat, amount="1000.00")
    spend(client, flat, "1100.00", month=9)
    spend(client, flat, "1100.00", month=10)

    found = alerts(client, flat["bob_headers"])
    assert len(found) == 2
    assert {n["payload"]["month"] for n in found} == {"2026-09", "2026-10"}


def test_raising_a_blown_budget_makes_it_speak_up_again(client, flat):
    """Otherwise everyone is silently un-warnable for the rest of the month."""
    budget = make_budget(client, flat, amount="1000.00").json()
    spend(client, flat, "1100.00")
    assert len(alerts(client, flat["bob_headers"])) == 1

    client.patch(
        f"/api/groups/{flat['group_id']}/budgets/{budget['id']}",
        json={"amount": "5000.00"},
        headers=flat["headers"],
    )
    spend(client, flat, "3000.00")

    found = alerts(client, flat["bob_headers"])
    assert len(found) == 2
    assert found[0]["kind"] == "BUDGET_WARNING"


def test_the_alert_says_which_budget_and_how_much(client, flat):
    make_budget(client, flat, amount="1000.00")
    spend(client, flat, "1200.00")

    payload = alerts(client, flat["bob_headers"])[0]["payload"]
    assert payload["category"] == "GROCERIES"
    assert payload["spent"] == "1200.00"
    assert payload["limit"] == "1000.00"
    assert payload["share_used"] == "120.0"
    assert payload["currency"] == "ILS"


def test_the_overall_budget_alerts_too(client, flat):
    make_budget(client, flat, category=None, amount="1000.00")
    spend(client, flat, "1100.00", category="RENT")

    found = alerts(client, flat["bob_headers"])
    assert len(found) == 1
    assert found[0]["payload"]["category"] is None
    assert "overall budget" in found[0]["title"]


def test_one_expense_can_trip_two_budgets(client, flat):
    make_budget(client, flat, category="GROCERIES", amount="500.00")
    make_budget(client, flat, category=None, amount="600.00")
    spend(client, flat, "700.00", category="GROCERIES")

    found = alerts(client, flat["bob_headers"])
    assert len(found) == 2
    assert {n["payload"]["category"] for n in found} == {"GROCERIES", None}


def test_an_alert_has_no_actor(client, flat):
    """Nobody did this. An arithmetic threshold did."""
    make_budget(client, flat, amount="1000.00")
    spend(client, flat, "1100.00")
    assert alerts(client, flat["bob_headers"])[0]["actor"] is None


def test_a_group_with_no_budget_is_never_alerted(client, flat):
    spend(client, flat, "99999.00")
    assert alerts(client, flat["bob_headers"]) == []


# --- isolation ------------------------------------------------------------


def test_budgets_stop_at_the_group_boundary(client, flat, make_user):
    make_budget(client, flat, amount="1000.00")

    outsider, outsider_headers = make_user(email="dave@example.com", name="Dave")
    other = client.post(
        "/api/groups", json={"name": "Other", "type": "TRIP"}, headers=outsider_headers
    ).json()
    client.post(
        f"/api/groups/{other['id']}/expenses",
        json={
            "title": "Shufersal",
            "total_amount": "5000.00",
            "expense_date": "2026-09-05",
            "payer_id": outsider["id"],
            "category": "GROCERIES",
            "split_type": "EQUAL",
        },
        headers=outsider_headers,
    )
    assert report(client, flat)["budgets"][0]["spent"] == "0.00"


def test_an_outsider_cannot_read_or_write_budgets(client, flat, make_user):
    _dave, dave_headers = make_user(email="dave@example.com", name="Dave")
    assert (
        client.get(f"/api/groups/{flat['group_id']}/budgets", headers=dave_headers).status_code
        == 403
    )
    assert make_budget(client, flat, headers=dave_headers).status_code == 403


def test_a_budget_from_another_group_is_not_found(client, flat, bob):
    _bob_user, bob_headers = bob
    budget = make_budget(client, flat).json()
    other = client.post(
        "/api/groups", json={"name": "Eilat", "type": "TRIP"}, headers=bob_headers
    ).json()

    response = client.delete(
        f"/api/groups/{other['id']}/budgets/{budget['id']}", headers=bob_headers
    )
    assert response.status_code == 404
