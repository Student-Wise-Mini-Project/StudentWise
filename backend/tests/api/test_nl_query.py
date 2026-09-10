"""Natural-language query endpoint tests.

Claude is stubbed throughout: these tests are about what happens to whatever SQL
comes back, which is the part that has to be right. They cost nothing and need
no API key, so CI runs them like any other test.
"""

from decimal import Decimal

import pytest

from app.services import nl_query_service
from app.services.nl_query_service import GeneratedSql


@pytest.fixture
def stub_claude(monkeypatch):
    """Make Claude return a chosen SQL string."""

    def _stub(sql: str, explanation: str = "Here is what you asked for."):
        monkeypatch.setattr(
            nl_query_service,
            "generate_sql",
            lambda question: GeneratedSql(sql=sql, explanation=explanation),
        )

    return _stub


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

    for title, amount, category in [
        ("Groceries", "300.00", "GROCERIES"),
        ("Electricity bill", "412.00", "UTILITIES"),
        ("Pizza", "150.00", "EATING_OUT"),
    ]:
        client.post(
            f"/api/groups/{group['id']}/expenses",
            json={
                "title": title,
                "total_amount": amount,
                "expense_date": "2026-09-01",
                "payer_id": alice_user["id"],
                "split_type": "EQUAL",
                "category": category,
            },
            headers=headers,
        )

    return {
        "group_id": group["id"],
        "headers": headers,
        "alice": alice_user,
        "bob": bob_user,
        "carol": carol_user,
    }


def ask(client, flat, question="how much did we spend?", headers=None):
    return client.post(
        f"/api/groups/{flat['group_id']}/analytics/ask",
        json={"question": question},
        headers=headers or flat["headers"],
    )


# --- the happy path ------------------------------------------------------


def test_a_question_returns_rows_and_the_sql_that_ran(client, flat, stub_claude):
    stub_claude(
        "SELECT category, SUM(total_amount) AS total FROM expenses GROUP BY category",
        "Total spending per category.",
    )
    response = ask(client, flat, "how much per category?")
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["question"] == "how much per category?"
    assert "expenses" in body["sql"].lower()
    assert body["explanation"] == "Total spending per category."
    assert set(body["columns"]) == {"category", "total"}
    assert body["row_count"] == 3
    totals = {r["category"]: Decimal(r["total"]) for r in body["rows"]}
    assert totals["UTILITIES"] == Decimal("412.00")


def test_money_comes_back_as_a_string(client, flat, stub_claude):
    """Same convention as the rest of the API -- never a float."""
    stub_claude("SELECT SUM(total_amount) AS total FROM expenses")
    body = ask(client, flat).json()
    assert isinstance(body["rows"][0]["total"], str)
    assert Decimal(body["rows"][0]["total"]) == Decimal("862.00")


def test_uuids_and_dates_are_serialised(client, flat, stub_claude):
    stub_claude("SELECT id, expense_date, created_at FROM expenses")
    body = ask(client, flat).json()
    row = body["rows"][0]
    assert isinstance(row["id"], str)
    assert row["expense_date"] == "2026-09-01"
    assert isinstance(row["created_at"], str)


def test_a_join_across_relations(client, flat, stub_claude):
    stub_claude(
        "SELECT u.name, SUM(s.owed_amount) AS owed FROM expense_splits s "
        "JOIN users u ON u.id = s.user_id GROUP BY u.name ORDER BY u.name"
    )
    body = ask(client, flat).json()
    assert [r["name"] for r in body["rows"]] == ["Alice", "Bob", "Carol"]


# --- isolation -----------------------------------------------------------


def test_results_never_leave_the_group(client, flat, stub_claude, make_user):
    """The model writes no group filter at all. The scoping CTEs must still
    keep another group's expenses out."""
    outsider, outsider_headers = make_user(email="dave@example.com", name="Dave")
    other = client.post(
        "/api/groups", json={"name": "Other", "type": "TRIP"}, headers=outsider_headers
    ).json()
    client.post(
        f"/api/groups/{other['id']}/expenses",
        json={
            "title": "SECRET_OTHER_GROUP",
            "total_amount": "9999.00",
            "expense_date": "2026-09-01",
            "payer_id": outsider["id"],
        },
        headers=outsider_headers,
    )

    stub_claude("SELECT title, total_amount FROM expenses")
    body = ask(client, flat).json()
    titles = [r["title"] for r in body["rows"]]
    assert "SECRET_OTHER_GROUP" not in titles
    assert len(titles) == 3


def test_selecting_all_users_only_returns_group_members(client, flat, stub_claude, make_user):
    make_user(email="dave@example.com", name="Dave")
    stub_claude("SELECT name FROM users ORDER BY name")
    body = ask(client, flat).json()
    assert [r["name"] for r in body["rows"]] == ["Alice", "Bob", "Carol"]


def test_password_hash_is_not_reachable(client, flat, stub_claude):
    stub_claude("SELECT name, password_hash FROM users")
    response = ask(client, flat)
    assert response.status_code == 400
    assert "password_hash" in response.json()["detail"]


# --- refusing unsafe generated SQL ---------------------------------------


@pytest.mark.parametrize(
    "sql",
    [
        "DELETE FROM expenses",
        "DROP TABLE users",
        "SELECT 1; DROP TABLE users",
        "SELECT * FROM public.expenses",
        "SELECT * FROM pg_catalog.pg_user",
        "WITH x AS (DELETE FROM settlements RETURNING *) SELECT * FROM x",
        "SELECT pg_sleep(30)",
        "not sql at all",
    ],
)
def test_unsafe_generated_sql_is_refused(client, flat, stub_claude, sql):
    stub_claude(sql)
    response = ask(client, flat)
    assert response.status_code == 400
    assert "rejected" in response.json()["detail"].lower()


def test_the_database_is_unchanged_after_a_refused_query(client, flat, stub_claude):
    stub_claude("DELETE FROM expenses")
    assert ask(client, flat).status_code == 400

    listed = client.get(f"/api/groups/{flat['group_id']}/expenses", headers=flat["headers"]).json()
    assert len(listed) == 3


# --- limits and validation ----------------------------------------------


def test_rows_are_capped_and_flagged(client, flat, stub_claude, monkeypatch):
    monkeypatch.setattr(nl_query_service.settings, "nl_query_row_limit", 2)
    stub_claude("SELECT title FROM expenses")
    body = ask(client, flat).json()
    assert body["row_count"] == 2
    assert body["truncated"] is True


def test_a_result_under_the_cap_is_not_flagged(client, flat, stub_claude):
    stub_claude("SELECT title FROM expenses")
    body = ask(client, flat).json()
    assert body["truncated"] is False


def test_a_too_short_question_is_rejected(client, flat, stub_claude):
    stub_claude("SELECT 1 AS x FROM expenses")
    assert ask(client, flat, "a").status_code == 422


def test_a_very_long_question_is_rejected(client, flat, stub_claude):
    stub_claude("SELECT 1 AS x FROM expenses")
    assert ask(client, flat, "x" * 501).status_code == 422


# --- configuration and access -------------------------------------------


def test_without_an_api_key_the_endpoint_reports_503(client, flat, monkeypatch):
    monkeypatch.setattr(nl_query_service.settings, "anthropic_api_key", None)
    response = ask(client, flat)
    assert response.status_code == 503
    assert "not configured" in response.json()["detail"]


def test_outsider_cannot_ask(client, flat, stub_claude, make_user):
    stub_claude("SELECT title FROM expenses")
    _outsider, outsider_headers = make_user(email="dave@example.com", name="Dave")
    assert ask(client, flat, headers=outsider_headers).status_code == 403


def test_asking_requires_authentication(client, flat, stub_claude):
    stub_claude("SELECT title FROM expenses")
    response = client.post(
        f"/api/groups/{flat['group_id']}/analytics/ask", json={"question": "how much?"}
    )
    assert response.status_code == 401
