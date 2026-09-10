"""Analytics endpoint tests."""

from decimal import Decimal

import pytest


@pytest.fixture
def flat(client, alice, bob, make_user):
    alice_user, headers = alice
    bob_user, _ = bob
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
    }


def add(client, flat, amount, *, when="2026-09-01", category=None, payer=None, participants=None):
    payload = {
        "title": category or "Thing",
        "total_amount": amount,
        "expense_date": when,
        "payer_id": (payer or flat["alice"])["id"],
        "split_type": "EQUAL",
    }
    if category:
        payload["category"] = category
    if participants is not None:
        payload["participants"] = participants
    r = client.post(
        f"/api/groups/{flat['group_id']}/expenses", json=payload, headers=flat["headers"]
    )
    assert r.status_code == 201, r.text
    return r.json()


def get(client, flat, path, **params):
    query = "&".join(f"{k}={v}" for k, v in params.items())
    url = f"/api/groups/{flat['group_id']}/analytics/{path}"
    if query:
        url += f"?{query}"
    return client.get(url, headers=flat["headers"])


# --- summary -------------------------------------------------------------


def test_summary_of_an_empty_group(client, flat):
    body = get(client, flat, "summary").json()
    assert Decimal(body["total_spent"]) == Decimal("0.00")
    assert body["expense_count"] == 0
    assert body["largest_expense"] is None
    assert body["scope"] == "group"


def test_summary_totals_and_average(client, flat):
    add(client, flat, "100.00")
    add(client, flat, "50.00")
    body = get(client, flat, "summary").json()
    assert Decimal(body["total_spent"]) == Decimal("150.00")
    assert body["expense_count"] == 2
    assert Decimal(body["average_expense"]) == Decimal("75.00")
    assert body["currency"] == "ILS"


def test_summary_reports_the_largest_expense(client, flat):
    add(client, flat, "20.00", category="small")
    big = add(client, flat, "500.00", category="big")
    body = get(client, flat, "summary").json()
    assert body["largest_expense"]["id"] == big["id"]
    assert Decimal(body["largest_expense"]["total_amount"]) == Decimal("500.00")


def test_summary_date_range(client, flat):
    add(client, flat, "10.00", when="2026-03-15")
    add(client, flat, "10.00", when="2026-09-01")
    body = get(client, flat, "summary").json()
    assert body["first_expense_date"] == "2026-03-15"
    assert body["last_expense_date"] == "2026-09-01"


def test_summary_respects_a_date_window(client, flat):
    add(client, flat, "10.00", when="2026-03-15")
    add(client, flat, "90.00", when="2026-09-01")
    body = get(client, flat, "summary", date_from="2026-08-01").json()
    assert Decimal(body["total_spent"]) == Decimal("90.00")
    assert body["expense_count"] == 1


def test_personal_scope_reports_the_users_share_not_the_total(client, flat):
    """The distinction that matters: 90 split three ways is 30 of personal
    spending, not 90."""
    add(client, flat, "90.00")
    group_view = get(client, flat, "summary").json()
    personal = get(client, flat, "summary", user_id=flat["alice"]["id"]).json()

    assert Decimal(group_view["total_spent"]) == Decimal("90.00")
    assert group_view["scope"] == "group"
    assert Decimal(personal["total_spent"]) == Decimal("30.00")
    assert personal["scope"] == "user"


def test_personal_scope_excludes_expenses_the_user_is_not_in(client, flat):
    add(client, flat, "60.00", participants=[{"user_id": flat["bob"]["id"]}])
    carol = get(client, flat, "summary", user_id=flat["carol"]["id"]).json()
    bob = get(client, flat, "summary", user_id=flat["bob"]["id"]).json()
    assert Decimal(carol["total_spent"]) == Decimal("0.00")
    assert Decimal(bob["total_spent"]) == Decimal("60.00")


def test_personal_scope_rejects_a_non_member(client, flat, make_user):
    outsider, _ = make_user(email="dave@example.com", name="Dave")
    assert get(client, flat, "summary", user_id=outsider["id"]).status_code == 400


# --- by category ---------------------------------------------------------


def test_category_breakdown_sorted_biggest_first(client, flat):
    add(client, flat, "300.00", category="bills")
    add(client, flat, "100.00", category="super")
    body = get(client, flat, "by-category").json()
    assert [c["category"] for c in body["categories"]] == ["bills", "super"]
    assert Decimal(body["total"]) == Decimal("400.00")


def test_category_percentages_add_up(client, flat):
    add(client, flat, "300.00", category="bills")
    add(client, flat, "100.00", category="super")
    body = get(client, flat, "by-category").json()
    shares = {c["category"]: Decimal(c["share_percent"]) for c in body["categories"]}
    assert shares == {"bills": Decimal("75.0"), "super": Decimal("25.0")}
    assert sum(shares.values()) == Decimal("100.0")


def test_expenses_without_a_category_are_labelled(client, flat):
    add(client, flat, "40.00")
    body = get(client, flat, "by-category").json()
    assert body["categories"][0]["category"] == "uncategorised"


def test_category_counts_expenses(client, flat):
    add(client, flat, "10.00", category="super")
    add(client, flat, "20.00", category="super")
    body = get(client, flat, "by-category").json()
    assert body["categories"][0]["expense_count"] == 2


def test_empty_group_has_no_categories(client, flat):
    body = get(client, flat, "by-category").json()
    assert body["categories"] == []
    assert Decimal(body["total"]) == Decimal("0.00")


# --- by month ------------------------------------------------------------


def test_monthly_trend(client, flat):
    add(client, flat, "100.00", when="2026-07-04")
    add(client, flat, "50.00", when="2026-08-11")
    body = get(client, flat, "by-month").json()
    assert [(m["month"], Decimal(m["total"])) for m in body["months"]] == [
        ("2026-07", Decimal("100.00")),
        ("2026-08", Decimal("50.00")),
    ]


def test_months_with_no_spending_are_filled_with_zero(client, flat):
    """A chart must not join June to September and imply a trend."""
    add(client, flat, "100.00", when="2026-06-01")
    add(client, flat, "80.00", when="2026-09-01")
    body = get(client, flat, "by-month").json()
    assert [m["month"] for m in body["months"]] == ["2026-06", "2026-07", "2026-08", "2026-09"]
    assert [Decimal(m["total"]) for m in body["months"]] == [
        Decimal("100.00"),
        Decimal("0.00"),
        Decimal("0.00"),
        Decimal("80.00"),
    ]


def test_month_gap_filling_crosses_a_year_boundary(client, flat):
    add(client, flat, "10.00", when="2025-11-20")
    add(client, flat, "10.00", when="2026-02-02")
    body = get(client, flat, "by-month").json()
    assert [m["month"] for m in body["months"]] == [
        "2025-11",
        "2025-12",
        "2026-01",
        "2026-02",
    ]


def test_monthly_trend_is_empty_for_an_empty_group(client, flat):
    assert get(client, flat, "by-month").json()["months"] == []


def test_monthly_trend_in_personal_scope(client, flat):
    add(client, flat, "90.00", when="2026-07-04")
    body = get(client, flat, "by-month", user_id=flat["bob"]["id"]).json()
    assert Decimal(body["months"][0]["total"]) == Decimal("30.00")


# --- by member -----------------------------------------------------------


def test_member_breakdown_separates_paid_from_consumed(client, flat):
    add(client, flat, "90.00", payer=flat["alice"])
    body = get(client, flat, "by-member").json()
    rows = {m["user"]["email"]: m for m in body["members"]}

    assert Decimal(rows["alice@example.com"]["paid"]) == Decimal("90.00")
    assert Decimal(rows["alice@example.com"]["consumed"]) == Decimal("30.00")
    assert Decimal(rows["bob@example.com"]["paid"]) == Decimal("0.00")
    assert Decimal(rows["bob@example.com"]["consumed"]) == Decimal("30.00")


def test_member_consumption_sums_to_the_group_total(client, flat):
    add(client, flat, "100.00")
    add(client, flat, "37.55")
    body = get(client, flat, "by-member").json()
    assert sum(Decimal(m["consumed"]) for m in body["members"]) == Decimal("137.55")


def test_member_breakdown_covers_everyone_even_with_no_spending(client, flat):
    body = get(client, flat, "by-member").json()
    assert len(body["members"]) == 3
    assert all(Decimal(m["consumed"]) == Decimal("0.00") for m in body["members"])


# --- access --------------------------------------------------------------


@pytest.mark.parametrize("path", ["summary", "by-category", "by-month", "by-member"])
def test_outsider_cannot_read_analytics(client, flat, make_user, path):
    _outsider, outsider_headers = make_user(email="dave@example.com", name="Dave")
    response = client.get(
        f"/api/groups/{flat['group_id']}/analytics/{path}", headers=outsider_headers
    )
    assert response.status_code == 403
