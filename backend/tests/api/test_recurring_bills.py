"""Recurring-bill endpoint tests.

The date arithmetic is covered in `tests/unit/test_recurrence.py`. These are
about the distinction the whole feature turns on -- rent posts itself, the
electricity waits for somebody to read the meter -- and about `run` being safe
to call as often as anyone likes.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest


def in_days(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


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


def make_bill(client, flat, *, headers=None, **overrides):
    payload = {
        "title": "Rent",
        "frequency": "MONTHLY",
        "first_due_on": in_days(0),
        "payer_id": flat["alice"]["id"],
        "amount": "3600.00",
        "category": "RENT",
    }
    payload.update(overrides)
    payload = {k: v for k, v in payload.items() if v is not None or k == "amount"}
    if payload.get("amount") is None:
        payload.pop("amount")
    return client.post(
        f"/api/groups/{flat['group_id']}/recurring-bills",
        json=payload,
        headers=headers or flat["headers"],
    )


def run(client, flat, headers=None):
    response = client.post(
        f"/api/groups/{flat['group_id']}/recurring-bills/run",
        headers=headers or flat["headers"],
    )
    assert response.status_code == 200, response.text
    return response.json()


def expenses(client, flat):
    return client.get(f"/api/groups/{flat['group_id']}/expenses", headers=flat["headers"]).json()


def bill_alerts(client, headers):
    body = client.get("/api/notifications", headers=headers).json()
    return [n for n in body["items"] if n["kind"] == "BILL_DUE"]


# --- keeping bills --------------------------------------------------------


def test_a_fixed_bill_says_it_posts_itself(client, flat):
    response = make_bill(client, flat)
    assert response.status_code == 201, response.text
    body = response.json()

    assert body["title"] == "Rent"
    assert body["amount"] == "3600.00"
    assert body["posts_itself"] is True
    assert body["frequency"] == "MONTHLY"
    assert body["active"] is True


def test_a_varying_bill_says_it_does_not(client, flat):
    body = make_bill(client, flat, title="Electricity", amount=None).json()
    assert body["amount"] is None
    assert body["posts_itself"] is False


def test_any_member_can_set_one_up(client, flat):
    """Unlike a split rule or a budget: adding a recurring bill is the same act
    as adding an expense, which any member may do."""
    assert make_bill(client, flat, headers=flat["bob_headers"]).status_code == 201


def test_the_first_due_date_cannot_be_in_the_past(client, flat):
    """A schedule nobody has seen yet should not conjure months of back-dated
    expenses on its first run."""
    response = make_bill(client, flat, first_due_on=in_days(-1))
    assert response.status_code == 400
    assert "cannot be in the past" in response.json()["detail"]


def test_the_payer_must_be_in_the_group(client, flat):
    response = make_bill(client, flat, payer_id="00000000-0000-0000-0000-000000000000")
    assert response.status_code == 400


def test_a_bill_can_be_paused_and_resumed(client, flat):
    bill = make_bill(client, flat).json()

    paused = client.patch(
        f"/api/groups/{flat['group_id']}/recurring-bills/{bill['id']}",
        json={"active": False},
        headers=flat["headers"],
    )
    assert paused.status_code == 200, paused.text
    assert paused.json()["active"] is False

    assert run(client, flat)["generated"] == []
    assert expenses(client, flat)["total"] == 0


def test_a_fixed_bill_can_become_a_reminder_only_one(client, flat):
    bill = make_bill(client, flat).json()
    response = client.patch(
        f"/api/groups/{flat['group_id']}/recurring-bills/{bill['id']}",
        json={"clear_amount": True},
        headers=flat["headers"],
    )
    assert response.json()["posts_itself"] is False


def test_bills_are_listed_soonest_first(client, flat):
    make_bill(client, flat, title="Later", first_due_on=in_days(20))
    make_bill(client, flat, title="Sooner", first_due_on=in_days(2), category="UTILITIES")

    listed = client.get(
        f"/api/groups/{flat['group_id']}/recurring-bills", headers=flat["headers"]
    ).json()
    assert [b["title"] for b in listed] == ["Sooner", "Later"]


def test_deleting_a_bill_leaves_its_expenses_alone(client, flat):
    bill = make_bill(client, flat).json()
    run(client, flat)
    assert expenses(client, flat)["total"] == 1

    assert (
        client.delete(
            f"/api/groups/{flat['group_id']}/recurring-bills/{bill['id']}",
            headers=flat["headers"],
        ).status_code
        == 204
    )
    assert expenses(client, flat)["total"] == 1, "rent that has been paid does not un-pay"


# --- posting --------------------------------------------------------------


def test_a_due_fixed_bill_posts_itself(client, flat):
    make_bill(client, flat)
    result = run(client, flat)

    assert len(result["generated"]) == 1
    expense = result["generated"][0]
    assert expense["title"] == "Rent"
    assert expense["total_amount"] == "3600.00"
    assert expense["source"] == "RECURRING"
    assert len(expense["splits"]) == 3


def test_a_bill_not_yet_due_waits(client, flat):
    make_bill(client, flat, first_due_on=in_days(20))
    assert run(client, flat)["generated"] == []


def test_the_schedule_moves_on_after_posting(client, flat):
    bill = make_bill(client, flat).json()
    assert bill["next_due_on"] == in_days(0)

    run(client, flat)
    after = client.get(
        f"/api/groups/{flat['group_id']}/recurring-bills/{bill['id']}", headers=flat["headers"]
    ).json()
    assert after["next_due_on"] > in_days(0)
    assert after["last_generated_on"] == in_days(0)


def test_running_twice_posts_once(client, flat):
    """The app calls this on load. It has to be safe to call constantly."""
    make_bill(client, flat)
    run(client, flat)
    second = run(client, flat)

    assert second["generated"] == []
    assert expenses(client, flat)["total"] == 1


def test_a_varying_bill_posts_nothing_and_asks(client, flat):
    """Inventing a number for the electricity would be worse than refusing."""
    make_bill(client, flat, title="Electricity", amount=None, category="UTILITIES")
    result = run(client, flat)

    assert result["generated"] == []
    assert [b["title"] for b in result["awaiting_amount"]] == ["Electricity"]
    assert expenses(client, flat)["total"] == 0


def test_a_varying_bill_is_recorded_by_hand(client, flat):
    bill = make_bill(client, flat, title="Electricity", amount=None, category="UTILITIES").json()

    response = client.post(
        f"/api/groups/{flat['group_id']}/recurring-bills/{bill['id']}/generate",
        json={"amount": "412.00"},
        headers=flat["headers"],
    )
    assert response.status_code == 201, response.text
    assert response.json()["total_amount"] == "412.00"
    assert response.json()["source"] == "RECURRING"

    after = client.get(
        f"/api/groups/{flat['group_id']}/recurring-bills/{bill['id']}", headers=flat["headers"]
    ).json()
    assert after["next_due_on"] > in_days(0)


def test_generating_a_varying_bill_without_an_amount_is_refused(client, flat):
    bill = make_bill(client, flat, title="Electricity", amount=None, category="UTILITIES").json()
    response = client.post(
        f"/api/groups/{flat['group_id']}/recurring-bills/{bill['id']}/generate",
        json={},
        headers=flat["headers"],
    )
    assert response.status_code == 400
    assert "no fixed amount" in response.json()["detail"]


def test_the_same_bill_cannot_be_posted_twice_for_one_date(client, flat):
    """Enforced by a unique index, not by a hopeful check -- two clients running
    the scheduler at once would otherwise post rent twice."""
    bill = make_bill(client, flat).json()
    when = in_days(0)

    first = client.post(
        f"/api/groups/{flat['group_id']}/recurring-bills/{bill['id']}/generate",
        json={"expense_date": when},
        headers=flat["headers"],
    )
    assert first.status_code == 201, first.text

    second = client.post(
        f"/api/groups/{flat['group_id']}/recurring-bills/{bill['id']}/generate",
        json={"expense_date": when},
        headers=flat["headers"],
    )
    assert second.status_code == 409
    assert expenses(client, flat)["total"] == 1


def test_expenses_are_attributed_to_whoever_set_the_bill_up(client, flat):
    """Opening the app should not make you the author of somebody else's rent,
    and the cron job has no author at all."""
    make_bill(client, flat, headers=flat["bob_headers"])
    result = run(client, flat)
    assert result["generated"][0]["created_by"] == flat["bob"]["id"]


# --- who is on the bill ---------------------------------------------------


def test_a_bill_can_name_a_subset(client, flat):
    make_bill(
        client,
        flat,
        title="Netflix",
        amount="60.00",
        category="ENTERTAINMENT",
        participants=[{"user_id": flat["alice"]["id"]}, {"user_id": flat["bob"]["id"]}],
    )
    expense = run(client, flat)["generated"][0]
    assert {s["user"]["email"] for s in expense["splits"]} == {
        "alice@example.com",
        "bob@example.com",
    }


def test_a_bill_that_names_nobody_uses_the_standing_split_rule(client, flat):
    """ "Rent, monthly" plus "rent by room size" is the combination this whole
    epic exists to make work."""
    client.post(
        f"/api/groups/{flat['group_id']}/split-rules",
        json={
            "name": "Rent by room size",
            "category": "RENT",
            "shares": [
                {"user_id": flat["alice"]["id"], "weight": "14"},
                {"user_id": flat["bob"]["id"], "weight": "12"},
                {"user_id": flat["carol"]["id"], "weight": "10"},
            ],
        },
        headers=flat["headers"],
    )
    make_bill(client, flat)

    expense = run(client, flat)["generated"][0]
    owed = {s["user"]["email"]: Decimal(s["owed_amount"]) for s in expense["splits"]}
    assert owed == {
        "alice@example.com": Decimal("1400.00"),
        "bob@example.com": Decimal("1200.00"),
        "carol@example.com": Decimal("1000.00"),
    }
    assert expense["split_rule"]["name"] == "Rent by room size"


def test_a_bill_naming_a_non_member_is_refused(client, flat):
    response = make_bill(
        client, flat, participants=[{"user_id": "00000000-0000-0000-0000-000000000000"}]
    )
    assert response.status_code == 400


# --- reminders ------------------------------------------------------------


def test_a_bill_coming_up_reminds_everyone(client, flat):
    make_bill(client, flat, title="Electricity", amount=None, first_due_on=in_days(2))
    result = run(client, flat)

    assert [b["title"] for b in result["reminded"]] == ["Electricity"]
    found = bill_alerts(client, flat["bob_headers"])
    assert len(found) == 1
    assert "Electricity is due" in found[0]["title"]
    assert found[0]["payload"]["needs_amount"] is True


def test_a_bill_further_off_says_nothing_yet(client, flat):
    make_bill(client, flat, title="Electricity", amount=None, first_due_on=in_days(10))
    assert run(client, flat)["reminded"] == []
    assert bill_alerts(client, flat["bob_headers"]) == []


def test_the_reminder_window_can_be_widened(client, flat):
    make_bill(
        client,
        flat,
        title="Electricity",
        amount=None,
        first_due_on=in_days(10),
        reminder_days_before=14,
    )
    assert len(run(client, flat)["reminded"]) == 1


def test_a_bill_does_not_nag_every_time_the_app_opens(client, flat):
    make_bill(client, flat, title="Electricity", amount=None, first_due_on=in_days(2))
    run(client, flat)
    run(client, flat)
    run(client, flat)
    assert len(bill_alerts(client, flat["bob_headers"])) == 1


def test_an_overdue_varying_bill_keeps_asking_across_periods(client, flat):
    """It is still unpaid, so the reminder stands -- but only one of them."""
    make_bill(client, flat, title="Electricity", amount=None, first_due_on=in_days(0))
    run(client, flat)
    run(client, flat)
    assert len(bill_alerts(client, flat["bob_headers"])) == 1


def test_a_fixed_bill_reminds_before_it_posts(client, flat):
    make_bill(client, flat, first_due_on=in_days(2))
    result = run(client, flat)

    assert result["generated"] == []
    found = bill_alerts(client, flat["bob_headers"])
    assert len(found) == 1
    assert found[0]["payload"]["needs_amount"] is False
    assert found[0]["payload"]["amount"] == "3600.00"


def test_a_reminder_has_no_actor(client, flat):
    """A calendar did this, not a person."""
    make_bill(client, flat, first_due_on=in_days(2))
    run(client, flat)
    assert bill_alerts(client, flat["bob_headers"])[0]["actor"] is None


# --- isolation ------------------------------------------------------------


def test_bills_stop_at_the_group_boundary(client, flat, make_user):
    make_bill(client, flat)
    _dave, dave_headers = make_user(email="dave@example.com", name="Dave")
    other = client.post(
        "/api/groups", json={"name": "Other", "type": "TRIP"}, headers=dave_headers
    ).json()

    listed = client.get(f"/api/groups/{other['id']}/recurring-bills", headers=dave_headers).json()
    assert listed == []

    other_run = client.post(
        f"/api/groups/{other['id']}/recurring-bills/run", headers=dave_headers
    ).json()
    assert other_run["generated"] == []


def test_an_outsider_cannot_touch_recurring_bills(client, flat, make_user):
    _dave, dave_headers = make_user(email="dave@example.com", name="Dave")
    assert (
        client.get(
            f"/api/groups/{flat['group_id']}/recurring-bills", headers=dave_headers
        ).status_code
        == 403
    )
    assert make_bill(client, flat, headers=dave_headers).status_code == 403


def test_a_bill_from_another_group_is_not_found(client, flat, bob):
    _bob_user, bob_headers = bob
    bill = make_bill(client, flat).json()
    other = client.post(
        "/api/groups", json={"name": "Eilat", "type": "TRIP"}, headers=bob_headers
    ).json()

    response = client.get(
        f"/api/groups/{other['id']}/recurring-bills/{bill['id']}", headers=bob_headers
    )
    assert response.status_code == 404
