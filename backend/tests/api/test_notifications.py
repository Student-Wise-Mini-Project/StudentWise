"""Notification tests.

Two things matter here and the rest is plumbing: you are told about things that
concern you and nothing else, and you cannot use reminders to nag someone who
does not owe you anything.
"""

import pytest


@pytest.fixture
def flat(client, alice, bob, make_user):
    """Alice (owner), Bob and Carol."""
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


def add_expense(client, flat, participants=None, total="90.00", title="Groceries", headers=None):
    payload = {
        "title": title,
        "total_amount": total,
        "expense_date": "2026-09-01",
        "payer_id": flat["alice"]["id"],
        "split_type": "EQUAL",
    }
    if participants is not None:
        payload["participants"] = [{"user_id": uid} for uid in participants]
    response = client.post(
        f"/api/groups/{flat['group_id']}/expenses",
        json=payload,
        headers=headers or flat["headers"],
    )
    assert response.status_code == 201, response.text
    return response.json()


def inbox(client, headers, **params):
    query = "&".join(f"{k}={v}" for k, v in params.items())
    url = "/api/notifications" + (f"?{query}" if query else "")
    response = client.get(url, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def unread(client, headers) -> int:
    response = client.get("/api/notifications/unread-count", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["unread"]


# --- who hears about an expense ------------------------------------------


def test_participants_are_told_and_the_author_is_not(client, flat):
    add_expense(client, flat)

    assert unread(client, flat["bob_headers"]) == 1
    assert unread(client, flat["carol_headers"]) == 1
    assert unread(client, flat["headers"]) == 0, "you do not need telling about your own entry"


def test_someone_left_off_the_expense_hears_nothing(client, flat):
    add_expense(client, flat, participants=[flat["alice"]["id"], flat["bob"]["id"]])
    assert unread(client, flat["bob_headers"]) == 1
    assert unread(client, flat["carol_headers"]) == 0


def test_the_notification_says_what_you_owe(client, flat):
    add_expense(client, flat, total="90.00")
    item = inbox(client, flat["bob_headers"])["items"][0]

    assert item["kind"] == "EXPENSE_ADDED"
    assert item["actor"]["email"] == "alice@example.com"
    assert "Groceries" in item["title"]
    assert "30.00" in item["body"]
    # The structured facts travel too, so a Hebrew UI never parses English.
    assert item["payload"]["owed_amount"] == "30.00"
    assert item["payload"]["currency"] == "ILS"


def test_money_in_the_payload_is_a_string(client, flat):
    add_expense(client, flat)
    payload = inbox(client, flat["bob_headers"])["items"][0]["payload"]
    assert isinstance(payload["total_amount"], str)


def test_notifications_die_with_their_expense(client, flat):
    expense = add_expense(client, flat)
    assert unread(client, flat["bob_headers"]) == 1

    assert (
        client.delete(f"/api/expenses/{expense['id']}", headers=flat["headers"]).status_code == 204
    )
    assert unread(client, flat["bob_headers"]) == 0, (
        "a notification pointing at nothing is a dead link"
    )


# --- comments and settlements --------------------------------------------


def test_a_comment_reaches_the_people_on_the_expense(client, flat):
    expense = add_expense(client, flat, participants=[flat["alice"]["id"], flat["bob"]["id"]])
    client.post("/api/notifications/read-all", headers=flat["bob_headers"])

    response = client.post(
        f"/api/expenses/{expense['id']}/comments",
        json={"body": "This was just the two of us"},
        headers=flat["headers"],
    )
    assert response.status_code == 201, response.text

    item = inbox(client, flat["bob_headers"], unread_only="true")["items"][0]
    assert item["kind"] == "COMMENT_ADDED"
    assert item["body"] == "This was just the two of us"


def test_someone_who_joined_the_thread_keeps_hearing_replies(client, flat):
    """Carol is not on the expense, but she asked a question -- so she should
    hear the answer."""
    expense = add_expense(client, flat, participants=[flat["alice"]["id"], flat["bob"]["id"]])
    client.post(
        f"/api/expenses/{expense['id']}/comments",
        json={"body": "Why am I not on this?"},
        headers=flat["carol_headers"],
    )
    client.post("/api/notifications/read-all", headers=flat["carol_headers"])

    client.post(
        f"/api/expenses/{expense['id']}/comments",
        json={"body": "You were away that week"},
        headers=flat["headers"],
    )
    assert unread(client, flat["carol_headers"]) == 1


def test_recording_a_repayment_tells_the_other_person(client, flat):
    response = client.post(
        f"/api/groups/{flat['group_id']}/settlements",
        json={
            "from_user_id": flat["bob"]["id"],
            "to_user_id": flat["alice"]["id"],
            "amount": "25.00",
        },
        headers=flat["headers"],
    )
    assert response.status_code == 201, response.text

    item = inbox(client, flat["bob_headers"])["items"][0]
    assert item["kind"] == "SETTLEMENT_RECORDED"
    assert item["payload"]["direction"] == "sent"
    assert "25.00" in item["body"]
    assert unread(client, flat["carol_headers"]) == 0


# --- reading and clearing ------------------------------------------------


def test_marking_one_as_read(client, flat):
    add_expense(client, flat)
    item = inbox(client, flat["bob_headers"])["items"][0]

    response = client.post(f"/api/notifications/{item['id']}/read", headers=flat["bob_headers"])
    assert response.status_code == 200, response.text
    assert response.json()["read_at"] is not None
    assert unread(client, flat["bob_headers"]) == 0


def test_marking_all_as_read(client, flat):
    add_expense(client, flat, title="One")
    add_expense(client, flat, title="Two")

    response = client.post("/api/notifications/read-all", headers=flat["bob_headers"])
    assert response.json()["marked_read"] == 2
    assert unread(client, flat["bob_headers"]) == 0
    # The rows are still there -- read is not deleted.
    assert inbox(client, flat["bob_headers"])["total"] == 2


def test_unread_only_filters_both_items_and_total(client, flat):
    add_expense(client, flat, title="One")
    add_expense(client, flat, title="Two")
    first = inbox(client, flat["bob_headers"])["items"][0]
    client.post(f"/api/notifications/{first['id']}/read", headers=flat["bob_headers"])

    page = inbox(client, flat["bob_headers"], unread_only="true")
    assert page["total"] == 1
    assert len(page["items"]) == 1


def test_you_cannot_touch_someone_else_s_notification(client, flat):
    add_expense(client, flat)
    bob_item = inbox(client, flat["bob_headers"])["items"][0]

    response = client.post(
        f"/api/notifications/{bob_item['id']}/read", headers=flat["carol_headers"]
    )
    assert response.status_code == 404, "saying 'forbidden' would confirm the id exists"
    assert unread(client, flat["bob_headers"]) == 1


def test_the_inbox_requires_authentication(client, flat):
    assert client.get("/api/notifications").status_code == 401


# --- reminders -----------------------------------------------------------


def test_a_reminder_goes_to_everyone_who_owes_you(client, flat):
    add_expense(client, flat, total="90.00")  # Bob and Carol each owe Alice 30
    client.post("/api/notifications/read-all", headers=flat["bob_headers"])
    client.post("/api/notifications/read-all", headers=flat["carol_headers"])

    response = client.post(
        f"/api/groups/{flat['group_id']}/reminders", json={}, headers=flat["headers"]
    )
    assert response.status_code == 201, response.text
    assert len(response.json()) == 2

    item = inbox(client, flat["bob_headers"], unread_only="true")["items"][0]
    assert item["kind"] == "PAYMENT_REMINDER"
    assert item["payload"]["amount"] == "30.00", (
        "the amount comes from the balances, not the request"
    )


def test_a_reminder_can_name_one_person(client, flat):
    add_expense(client, flat, total="90.00")
    response = client.post(
        f"/api/groups/{flat['group_id']}/reminders",
        json={"debtor_ids": [flat["bob"]["id"]]},
        headers=flat["headers"],
    )
    assert response.status_code == 201, response.text
    assert len(response.json()) == 1

    assert unread(client, flat["carol_headers"]) == 1, "only the expense notification"


def test_you_cannot_remind_someone_who_owes_you_nothing(client, flat):
    """Otherwise this is a harassment feature, not a payments feature."""
    add_expense(client, flat, total="90.00")
    response = client.post(
        f"/api/groups/{flat['group_id']}/reminders",
        json={"debtor_ids": [flat["carol"]["id"]]},
        headers=flat["carol_headers"],
    )
    assert response.status_code == 400


def test_reminders_with_nothing_outstanding_are_refused(client, flat):
    response = client.post(
        f"/api/groups/{flat['group_id']}/reminders", json={}, headers=flat["headers"]
    )
    assert response.status_code == 400
    assert "Nobody owes you" in response.json()["detail"]


def test_an_outsider_cannot_send_reminders(client, flat, make_user):
    _dave, dave_headers = make_user(email="dave@example.com", name="Dave")
    response = client.post(
        f"/api/groups/{flat['group_id']}/reminders", json={}, headers=dave_headers
    )
    assert response.status_code == 403
