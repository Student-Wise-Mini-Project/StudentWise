"""Anomaly endpoint tests."""

from decimal import Decimal

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
        f"/api/groups/{group['id']}/members", json={"email": "bob@example.com"}, headers=headers
    )
    return {"group_id": group["id"], "headers": headers, "alice": alice_user, "bob": bob_user}


def add(client, flat, title, amount, when, category="UTILITIES"):
    r = client.post(
        f"/api/groups/{flat['group_id']}/expenses",
        json={
            "title": title,
            "total_amount": amount,
            "expense_date": when,
            "payer_id": flat["alice"]["id"],
            "split_type": "EQUAL",
            "category": category,
        },
        headers=flat["headers"],
    )
    assert r.status_code == 201, r.text
    return r.json()


def bills(client, flat, title, amounts, start_month=3):
    """Post one bill per month, oldest first."""
    created = []
    for offset, amount in enumerate(amounts):
        month = start_month + offset
        created.append(add(client, flat, title, amount, f"2026-{month:02d}-05"))
    return created


def anomalies(client, flat, **params):
    query = "&".join(f"{k}={v}" for k, v in params.items())
    url = f"/api/groups/{flat['group_id']}/analytics/anomalies"
    if query:
        url += f"?{query}"
    response = client.get(url, headers=flat["headers"])
    assert response.status_code == 200, response.text
    return response.json()["anomalies"]


# --- the core case -------------------------------------------------------


def test_a_group_with_no_history_reports_nothing(client, flat):
    assert anomalies(client, flat) == []


def test_a_spike_in_a_recurring_bill_is_caught(client, flat):
    bills(client, flat, "Electricity bill", ["388.00", "401.50", "376.20", "419.90", "1244.00"])
    found = anomalies(client, flat)
    assert len(found) == 1
    assert found[0]["expense"]["title"] == "Electricity bill"
    assert Decimal(found[0]["expense"]["total_amount"]) == Decimal("1244.00")
    assert found[0]["direction"] == "HIGH"
    assert Decimal(found[0]["percent_change"]) > 0


def test_the_report_explains_itself(client, flat):
    bills(client, flat, "Electricity bill", ["400.00", "400.00", "400.00", "400.00", "800.00"])
    found = anomalies(client, flat)[0]
    assert Decimal(found["baseline"]) == Decimal("400.00")
    assert Decimal(found["difference"]) == Decimal("400.00")
    assert Decimal(found["percent_change"]) == Decimal("100.0")
    assert found["series_label"] == "electricity bill"
    assert found["series_size"] == 5


def test_a_steady_bill_is_never_flagged(client, flat):
    bills(client, flat, "Water bill", ["142.00", "155.30", "138.90", "161.40", "149.70"])
    assert anomalies(client, flat) == []


def test_series_are_kept_apart_by_title(client, flat):
    """An electricity bill is compared against electricity bills, not against
    the weekly shop."""
    bills(client, flat, "Electricity bill", ["400.00", "400.00", "400.00", "400.00", "900.00"])
    bills(client, flat, "Groceries", ["120.00", "340.00", "95.00", "410.00", "260.00"])
    found = anomalies(client, flat)
    assert [a["expense"]["title"] for a in found] == ["Electricity bill"]


def test_titles_are_matched_ignoring_case_and_spacing(client, flat):
    for when, title in [
        ("2026-03-05", "Electricity bill"),
        ("2026-04-05", "electricity  bill"),
        ("2026-05-05", "ELECTRICITY BILL"),
        ("2026-06-05", " Electricity Bill "),
    ]:
        add(client, flat, title, "400.00", when)
    add(client, flat, "Electricity bill", "1000.00", "2026-07-05")

    found = anomalies(client, flat)
    assert len(found) == 1
    assert found[0]["series_size"] == 5


def test_a_one_off_expense_is_never_an_anomaly(client, flat):
    """However large -- there is no history to judge it against."""
    bills(client, flat, "Electricity bill", ["400.00", "400.00", "400.00", "400.00", "400.00"])
    add(client, flat, "New sofa", "9000.00", "2026-09-01", category="OTHER")
    assert anomalies(client, flat) == []


def test_a_drop_is_reported_as_low(client, flat):
    bills(client, flat, "Electricity bill", ["400.00", "410.00", "395.00", "405.00", "40.00"])
    found = anomalies(client, flat)
    assert found[0]["direction"] == "LOW"
    assert Decimal(found[0]["percent_change"]) < 0


# --- filters -------------------------------------------------------------


def test_direction_filter(client, flat):
    bills(client, flat, "Electricity bill", ["400.00", "400.00", "400.00", "400.00", "1200.00"])
    bills(client, flat, "Water bill", ["150.00", "150.00", "150.00", "150.00", "10.00"])

    assert [a["direction"] for a in anomalies(client, flat, direction="HIGH")] == ["HIGH"]
    assert [a["direction"] for a in anomalies(client, flat, direction="LOW")] == ["LOW"]
    assert len(anomalies(client, flat)) == 2


def test_an_unknown_direction_is_rejected(client, flat):
    response = client.get(
        f"/api/groups/{flat['group_id']}/analytics/anomalies?direction=SIDEWAYS",
        headers=flat["headers"],
    )
    assert response.status_code == 422


def test_the_date_window_narrows_the_report_not_the_baseline(client, flat):
    """The crucial one. Filtering the history first would leave a short window
    with nothing to compare against, and the spike would go unreported."""
    bills(client, flat, "Electricity bill", ["400.00", "400.00", "400.00", "400.00", "1200.00"])

    # The window holds only the spike -- its four months of history sit outside.
    found = anomalies(client, flat, date_from="2026-07-01")
    assert len(found) == 1
    assert Decimal(found[0]["baseline"]) == Decimal("400.00")


def test_the_date_window_can_exclude_an_anomaly(client, flat):
    bills(client, flat, "Electricity bill", ["400.00", "400.00", "400.00", "400.00", "1200.00"])
    assert anomalies(client, flat, date_to="2026-06-30") == []


# --- ordering and access -------------------------------------------------


def test_the_worst_anomaly_comes_first(client, flat):
    bills(client, flat, "Electricity bill", ["400.00", "400.00", "400.00", "400.00", "500.00"])
    bills(client, flat, "Water bill", ["150.00", "150.00", "150.00", "150.00", "1500.00"])
    found = anomalies(client, flat)
    assert len(found) == 2
    assert found[0]["expense"]["title"] == "Water bill"
    assert abs(Decimal(found[0]["percent_change"])) > abs(Decimal(found[1]["percent_change"]))


def test_outsider_cannot_read_anomalies(client, flat, make_user):
    _outsider, outsider_headers = make_user(email="dave@example.com", name="Dave")
    response = client.get(
        f"/api/groups/{flat['group_id']}/analytics/anomalies", headers=outsider_headers
    )
    assert response.status_code == 403


def test_anomalies_require_authentication(client, flat):
    assert client.get(f"/api/groups/{flat['group_id']}/analytics/anomalies").status_code == 401
