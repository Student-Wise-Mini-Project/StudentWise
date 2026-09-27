"""Bills from Gmail: where each one goes, and the review of the rest.

Google and Claude are both replaced. A fake mailbox holds the emails a test
needs, and the "model" returns a chosen reading for each. What is under test
is everything in between: routing, the multiple-flats case, the phishing guard,
double-posting, idempotency, and that nothing unapproved ever reaches money.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from cryptography.fernet import Fernet

from app.ai import bill_parser, gmail
from app.ai.bill_parser import ExtractedBill, UnreadableEmail
from app.ai.gmail import EmailMessage, GmailAuthError, GoogleGrant
from app.config import settings
from app.models.expense import Expense

IEC = "noreply@iec.co.il"
STRANGER = "billing@totally-real-bills.com"


# --- the fakes -------------------------------------------------------------------


class FakeMailbox:
    def __init__(self, emails, fail_auth=False):
        self.emails = emails
        self.fail_auth = fail_auth
        self.fetched = []

    def search(self, query, max_results):
        if self.fail_auth:
            raise GmailAuthError("expired")
        return [e.id for e in self.emails][:max_results]

    def fetch(self, message_id):
        self.fetched.append(message_id)
        return next(e for e in self.emails if e.id == message_id)


@pytest.fixture
def world(monkeypatch, client, make_user):
    """Configured Gmail, three flatmates, and a mailbox and reader to fill in."""
    monkeypatch.setattr(settings, "google_client_id", "client-id")
    monkeypatch.setattr(settings, "google_client_secret", "client-secret")
    monkeypatch.setattr(settings, "token_encryption_key", Fernet.generate_key().decode())
    monkeypatch.setattr(settings, "bill_trusted_sender_domains", ["iec.co.il"])

    mailbox = FakeMailbox([])
    readings: dict[str, object] = {}

    monkeypatch.setattr(gmail, "authorization_url", lambda state: f"https://g.test/?state={state}")
    monkeypatch.setattr(gmail, "exchange_code", lambda code: GoogleGrant("refresh", "a@gmail.com"))
    monkeypatch.setattr(gmail, "open_mailbox", lambda token: mailbox)
    monkeypatch.setattr(gmail, "revoke", lambda token: None)

    def read(email):
        reading = readings[email.id]
        if isinstance(reading, Exception):
            raise reading
        return reading, {}

    monkeypatch.setattr(bill_parser, "read_bill", read)

    alice, alice_h = make_user(email="alice@example.com", name="Alice")
    bob, bob_h = make_user(email="bob@example.com", name="Bob")
    carol, carol_h = make_user(email="carol@example.com", name="Carol")

    def group(name, *, type_="SHARED_APARTMENT", address=None, members=("bob@example.com",)):
        g = client.post("/api/groups", json={"name": name, "type": type_}, headers=alice_h).json()
        for email in members:
            client.post(f"/api/groups/{g['id']}/members", json={"email": email}, headers=alice_h)
        if address:
            client.patch(f"/api/groups/{g['id']}", json={"address": address}, headers=alice_h)
        return g["id"]

    # Alice connects her Gmail.
    from urllib.parse import parse_qs, urlparse

    url = client.post("/api/integrations/gmail/connect", headers=alice_h).json()[
        "authorization_url"
    ]
    state = parse_qs(urlparse(url).query)["state"][0]
    client.get(
        "/api/integrations/gmail/callback",
        params={"code": "c", "state": state},
        follow_redirects=False,
    )

    class World:
        pass

    w = World()
    w.client, w.mailbox, w.readings, w.group = client, mailbox, readings, group
    w.alice, w.bob, w.carol = alice, bob, carol
    w.h = alice_h
    w.bob_h, w.carol_h = bob_h, carol_h
    return w


def bill_email(world, message_id, *, sender=IEC, **reading):
    world.mailbox.emails.append(
        EmailMessage(
            id=message_id,
            sender=sender,
            subject="חשבון חשמל",
            received_at=None,
            text="",
            attachments=[],
        )
    )
    fields = {
        "is_bill": True,
        "provider_name": "חברת החשמל",
        "total_amount": "412.30",
        "currency": "ILS",
        "due_date": "2026-10-15",
        "issue_date": "2026-09-20",
        "service_address": "דיזנגוף 5 תל אביב",
        "invoice_number": message_id,
        "category": "UTILITIES",
    }
    fields.update(reading)
    world.readings[message_id] = (
        reading["raises"] if "raises" in reading else ExtractedBill(**fields)
    )


def sync(world, headers=None):
    response = world.client.post("/api/integrations/gmail/sync", headers=headers or world.h)
    assert response.status_code == 200, response.text
    return response.json()


def pending(world, headers=None):
    return world.client.get("/api/bills", headers=headers or world.h).json()


def expenses(world, group_id):
    return world.client.get(f"/api/groups/{group_id}/expenses", headers=world.h).json()


# --- the one-flat case -----------------------------------------------------------------


def test_a_utility_bill_for_the_only_flat_is_split_straight_away(world):
    flat = world.group("Dizengoff 5", members=("bob@example.com", "carol@example.com"))
    bill_email(world, "m1")

    assert sync(world) == {
        "checked": 1,
        "imported": 1,
        "needs_review": 0,
        "skipped": 0,
        "needs_reconnect": False,
    }
    listed = expenses(world, flat)
    assert listed["total"] == 1
    expense = listed["items"][0]
    assert expense["title"] == "חברת החשמל"
    assert expense["total_amount"] == "412.30"
    assert expense["source"] == "GMAIL_API"
    assert expense["category"] == "UTILITIES"
    assert expense["expense_date"] == "2026-09-20"
    assert expense["payer"]["id"] == world.alice["id"]
    # Everyone in the flat, at their default weights: equal here.
    owed = sorted(Decimal(s["owed_amount"]) for s in expense["splits"])
    assert owed == [Decimal("137.43"), Decimal("137.43"), Decimal("137.44")]
    assert expense["ai_metadata"]["due_date"] == "2026-10-15"
    assert pending(world)["total"] == 0


def test_the_flatmates_are_told_like_any_other_expense(world):
    world.group("Dizengoff 5")
    bill_email(world, "m1")
    sync(world)
    notes = world.client.get("/api/notifications", headers=world.bob_h).json()["items"]
    assert [n["kind"] for n in notes] == ["EXPENSE_ADDED"]


def test_trips_couples_and_solo_groups_are_never_candidates(world):
    flat = world.group("Dizengoff 5")
    world.group("Eilat", type_="TRIP")
    world.group("Just me", type_="SOLO", members=())
    bill_email(world, "m1")
    assert sync(world)["imported"] == 1
    assert expenses(world, flat)["total"] == 1


def test_with_no_flat_at_all_it_waits(world):
    world.group("Eilat", type_="TRIP")
    bill_email(world, "m1")
    assert sync(world)["needs_review"] == 1
    assert pending(world)["items"][0]["review_reason"] == "NO_FLAT"


# --- several flats -----------------------------------------------------------------------


def test_the_address_on_the_bill_picks_the_flat(world):
    world.group("Florentin", address="פלורנטין 22 תל אביב")
    dizengoff = world.group("Dizengoff", address="דיזנגוף 5, תל אביב")
    bill_email(world, "m1", service_address="רח' דיזנגוף 5 דירה 3, תל אביב-יפו")

    assert sync(world)["imported"] == 1
    assert expenses(world, dizengoff)["total"] == 1


def test_a_different_house_number_is_not_a_match(world):
    world.group("Dizengoff 5", address="דיזנגוף 5 תל אביב")
    world.group("Florentin", address="פלורנטין 22 תל אביב")
    bill_email(world, "m1", service_address="דיזנגוף 50 תל אביב")

    assert sync(world)["needs_review"] == 1
    assert pending(world)["items"][0]["review_reason"] == "AMBIGUOUS_FLAT"


def test_when_the_flats_cannot_be_told_apart_it_waits_with_a_suggestion(world):
    world.group("Haifa", address="הרצל 10 חיפה")
    world.group("Tel Aviv", address="הרצל 10 תל אביב")
    bill_email(world, "m1", service_address="הרצל 10")

    sync(world)
    bill = pending(world)["items"][0]
    assert bill["review_reason"] == "AMBIGUOUS_FLAT"
    assert bill["group"]["name"] in {"Haifa", "Tel Aviv"}
    assert bill["expense_id"] is None


# --- what always waits for a person ------------------------------------------------------------


def test_an_unknown_sender_waits_even_for_a_certain_flat(world):
    flat = world.group("Dizengoff 5")
    bill_email(world, "m1", sender=STRANGER, total_amount="2000.00")

    assert sync(world)["needs_review"] == 1
    bill = pending(world)["items"][0]
    assert bill["review_reason"] == "UNKNOWN_SENDER"
    assert bill["group"]["id"] == flat
    assert expenses(world, flat)["total"] == 0


def test_a_bill_whose_amount_could_not_be_read_waits(world):
    world.group("Dizengoff 5")
    bill_email(world, "m1", total_amount=None)
    sync(world)
    assert pending(world)["items"][0]["review_reason"] == "NO_AMOUNT"


def test_a_bill_in_another_currency_waits(world):
    world.group("Dizengoff 5")
    bill_email(world, "m1", currency="EUR")
    sync(world)
    assert pending(world)["items"][0]["review_reason"] == "CURRENCY_MISMATCH"


def in_ten_days():
    return (date.today() + timedelta(days=10)).isoformat()


def test_a_fixed_recurring_bill_of_the_same_kind_would_post_twice_so_it_waits(world):
    flat = world.group("Dizengoff 5")
    world.client.post(
        f"/api/groups/{flat}/recurring-bills",
        json={
            "title": "Electricity",
            "frequency": "EVERY_2_MONTHS",
            "first_due_on": in_ten_days(),
            "payer_id": world.alice["id"],
            "amount": "400.00",
            "category": "UTILITIES",
        },
        headers=world.h,
    )
    bill_email(world, "m1")
    sync(world)
    assert pending(world)["items"][0]["review_reason"] == "RECURRING_CONFLICT"


def test_a_recurring_bill_waiting_for_its_amount_is_no_conflict(world):
    flat = world.group("Dizengoff 5")
    world.client.post(
        f"/api/groups/{flat}/recurring-bills",
        json={
            "title": "Electricity",
            "frequency": "EVERY_2_MONTHS",
            "first_due_on": in_ten_days(),
            "payer_id": world.alice["id"],
            "category": "UTILITIES",
        },
        headers=world.h,
    )
    bill_email(world, "m1")
    assert sync(world)["imported"] == 1


def test_a_password_protected_bill_waits_and_can_be_approved_with_the_amount_typed(world):
    flat = world.group("Dizengoff 5")
    bill_email(world, "m1", raises=UnreadableEmail("encrypted PDF"))
    sync(world)
    bill = pending(world)["items"][0]
    assert bill["review_reason"] == "UNREADABLE"
    assert bill["subject"] == "חשבון חשמל"

    no_amount = world.client.post(
        f"/api/bills/{bill['id']}/approve", json={"group_id": flat}, headers=world.h
    )
    assert no_amount.status_code == 400

    approved = world.client.post(
        f"/api/bills/{bill['id']}/approve",
        json={"group_id": flat, "total_amount": "388.10"},
        headers=world.h,
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["total_amount"] == "388.10"


# --- what is skipped ---------------------------------------------------------------------------


def test_an_email_that_is_not_a_bill_is_skipped_and_nothing_about_it_kept(world, db):
    from app.models.ingested_bill import IngestedBill

    world.group("Dizengoff 5")
    bill_email(world, "m1", is_bill=False)
    assert sync(world)["skipped"] == 1
    row = db.query(IngestedBill).one()
    assert row.status == "SKIPPED"
    assert row.subject is None and row.sender is None and row.total_amount is None


def test_the_same_bill_from_a_flatmates_mailbox_is_not_split_twice(world, monkeypatch):
    flat = world.group("Dizengoff 5")
    bill_email(world, "alice-copy", invoice_number="INV-77")
    sync(world)

    # Bob connects too, and his copy of the same bill arrives.
    from urllib.parse import parse_qs, urlparse

    url = world.client.post("/api/integrations/gmail/connect", headers=world.bob_h).json()[
        "authorization_url"
    ]
    state = parse_qs(urlparse(url).query)["state"][0]
    world.client.get(
        "/api/integrations/gmail/callback",
        params={"code": "c", "state": state},
        follow_redirects=False,
    )
    bill_email(world, "bob-copy", invoice_number="INV-77")
    world.mailbox.emails = [e for e in world.mailbox.emails if e.id == "bob-copy"]

    assert sync(world, world.bob_h)["skipped"] == 1
    assert expenses(world, flat)["total"] == 1


def test_a_deleted_expense_does_not_block_the_same_bill_forever(world):
    flat = world.group("Dizengoff 5")
    bill_email(world, "first", invoice_number="INV-9")
    sync(world)
    expense_id = expenses(world, flat)["items"][0]["id"]
    world.client.delete(f"/api/expenses/{expense_id}", headers=world.h)

    # The same bill arrives again -- forwarded, or from a flatmate's mailbox.
    bill_email(world, "second", invoice_number="INV-9")
    world.mailbox.emails = [e for e in world.mailbox.emails if e.id == "second"]
    assert sync(world)["imported"] == 1
    assert expenses(world, flat)["total"] == 1


# --- running it again -------------------------------------------------------------------------


def test_syncing_twice_reads_each_email_once(world):
    flat = world.group("Dizengoff 5")
    bill_email(world, "m1")
    sync(world)
    assert sync(world)["checked"] == 0
    assert world.mailbox.fetched == ["m1"]
    assert expenses(world, flat)["total"] == 1


def test_a_sync_reads_at_most_the_configured_number_and_the_next_one_continues(world, monkeypatch):
    world.group("Dizengoff 5")
    monkeypatch.setattr(settings, "gmail_max_messages_per_sync", 2)
    for i in range(3):
        bill_email(world, f"m{i}")
    assert sync(world)["checked"] == 2
    assert sync(world)["checked"] == 1


def test_an_expired_google_token_asks_to_reconnect(world):
    world.mailbox.fail_auth = True
    assert sync(world)["needs_reconnect"] is True
    assert world.client.get("/api/integrations/gmail", headers=world.h).json()["needs_reconnect"]


def test_syncing_without_a_connection_is_a_404(world):
    assert (
        world.client.post("/api/integrations/gmail/sync", headers=world.carol_h).status_code == 404
    )


# --- nothing unapproved reaches money ------------------------------------------------------------


def test_a_pending_bill_does_not_touch_balances(world):
    flat = world.group("Dizengoff 5")
    bill_email(world, "m1", sender=STRANGER)
    sync(world)
    balances = world.client.get(f"/api/groups/{flat}/balances", headers=world.h).json()
    assert {Decimal(b["net"]) for b in balances["balances"]} == {Decimal("0.00")}


# --- the review list ------------------------------------------------------------------------------


def test_approving_splits_it_in_the_chosen_flat(world, db):
    flat = world.group("Dizengoff 5")
    bill_email(world, "m1", sender=STRANGER)
    sync(world)
    bill_id = pending(world)["items"][0]["id"]

    response = world.client.post(
        f"/api/bills/{bill_id}/approve", json={"group_id": flat}, headers=world.h
    )
    assert response.status_code == 200, response.text
    assert response.json()["source"] == "GMAIL_API"
    assert pending(world)["total"] == 0
    approved = world.client.get("/api/bills?status=APPROVED", headers=world.h).json()["items"]
    assert approved[0]["expense_id"] == response.json()["id"]
    assert db.get(Expense, response.json()["id"]) is not None


def test_a_bill_can_only_be_approved_once(world):
    flat = world.group("Dizengoff 5")
    bill_email(world, "m1", sender=STRANGER)
    sync(world)
    bill_id = pending(world)["items"][0]["id"]
    url = f"/api/bills/{bill_id}/approve"
    assert world.client.post(url, json={"group_id": flat}, headers=world.h).status_code == 200
    assert world.client.post(url, json={"group_id": flat}, headers=world.h).status_code == 409


def test_someone_elses_bill_cannot_be_seen_or_approved(world):
    flat = world.group("Dizengoff 5")
    bill_email(world, "m1", sender=STRANGER)
    sync(world)
    bill_id = pending(world)["items"][0]["id"]
    assert pending(world, world.bob_h)["total"] == 0
    response = world.client.post(
        f"/api/bills/{bill_id}/approve", json={"group_id": flat}, headers=world.bob_h
    )
    assert response.status_code == 404


def test_it_cannot_be_approved_into_a_group_the_user_is_not_in(world):
    world.group("Dizengoff 5")
    others = world.client.post(
        "/api/groups", json={"name": "Not mine", "type": "SHARED_APARTMENT"}, headers=world.carol_h
    ).json()["id"]
    bill_email(world, "m1", sender=STRANGER)
    sync(world)
    bill_id = pending(world)["items"][0]["id"]
    response = world.client.post(
        f"/api/bills/{bill_id}/approve", json={"group_id": others}, headers=world.h
    )
    assert response.status_code == 404


def test_it_cannot_be_approved_into_a_closed_group(world):
    flat = world.group("Dizengoff 5")
    bill_email(world, "m1", sender=STRANGER)
    sync(world)
    bill_id = pending(world)["items"][0]["id"]
    world.client.post(f"/api/groups/{flat}/close", headers=world.h)
    response = world.client.post(
        f"/api/bills/{bill_id}/approve", json={"group_id": flat}, headers=world.h
    )
    assert response.status_code == 409


def test_dismissing_takes_it_off_the_list(world):
    world.group("Dizengoff 5")
    bill_email(world, "m1", sender=STRANGER)
    sync(world)
    bill_id = pending(world)["items"][0]["id"]
    response = world.client.post(f"/api/bills/{bill_id}/dismiss", headers=world.h)
    assert response.status_code == 200
    assert response.json()["status"] == "DISMISSED"
    assert pending(world)["total"] == 0


# --- the flat's address -------------------------------------------------------------------------


def test_an_owner_can_set_and_clear_the_flat_address(world):
    flat = world.group("Dizengoff 5")
    url = f"/api/groups/{flat}"
    set_ = world.client.patch(url, json={"address": "  דיזנגוף   5, תל אביב "}, headers=world.h)
    assert set_.json()["address"] == "דיזנגוף 5, תל אביב"
    cleared = world.client.patch(url, json={"address": ""}, headers=world.h)
    assert cleared.json()["address"] is None


# --- the cron script ------------------------------------------------------------------------------


def test_the_cron_sync_carries_on_past_a_broken_mailbox(world, db, monkeypatch):
    from app.services import gmail_service

    world.group("Dizengoff 5")
    bill_email(world, "m1")
    calls = []

    real_sync = gmail_service.sync

    def flaky(db_, user):
        calls.append(user.id)
        if len(calls) == 1:
            raise RuntimeError("Gmail had a bad day")
        return real_sync(db_, user)

    monkeypatch.setattr(gmail_service, "sync", flaky)
    # A second connected mailbox, so there is someone after the failure.
    from app.core import crypto
    from app.models.gmail_connection import GmailConnection

    db.add(
        GmailConnection(
            user_id=world.bob["id"],
            google_email="bob@gmail.com",
            refresh_token_encrypted=crypto.encrypt("refresh"),
        )
    )
    db.commit()

    results = gmail_service.sync_everyone(db)
    assert len(results) == 2
    assert sum(isinstance(r, str) for r in results.values()) == 1
