"""Deciding where a bill from email goes, and whether a person must look first."""

import uuid

import pytest

from app.domain.bill_routing import FlatFacts, route_bill, sender_is_trusted
from app.models.enums import BillReviewReason

A, B = uuid.UUID(int=1), uuid.UUID(int=2)


def route(**overrides):
    args = {
        "amount_known": True,
        "trusted_sender": True,
        "flats": [FlatFacts(A, "דיזנגוף 5 תל אביב", has_fixed_recurring=False)],
        "service_address": "דיזנגוף 5 תל אביב",
        "threshold": 85,
        "margin": 10,
    }
    args.update(overrides)
    return route_bill(**args)


def test_a_trusted_bill_for_the_only_flat_is_split():
    decision = route()
    assert decision.group_id == A
    assert decision.reason is None


def test_one_flat_needs_no_address_at_all():
    decision = route(flats=[FlatFacts(A, None, False)], service_address=None)
    assert decision.group_id == A


def test_no_amount_always_waits():
    assert route(amount_known=False).reason is BillReviewReason.NO_AMOUNT


def test_no_flat_waits():
    assert route(flats=[]).reason is BillReviewReason.NO_FLAT


def test_several_flats_are_told_apart_by_address():
    decision = route(
        flats=[
            FlatFacts(A, "פלורנטין 22 תל אביב", False),
            FlatFacts(B, "דיזנגוף 5 תל אביב", False),
        ]
    )
    assert decision.group_id == B
    assert decision.address_score is not None and decision.address_score >= 85


def test_several_flats_and_no_clear_match_waits_with_a_suggestion():
    decision = route(
        flats=[FlatFacts(A, "הרצל 10 חיפה", False), FlatFacts(B, "הרצל 10 תל אביב", False)],
        service_address="הרצל 10",
    )
    assert decision.group_id is None
    assert decision.reason is BillReviewReason.AMBIGUOUS_FLAT
    assert decision.suggested_group_id in {A, B}


def test_an_unknown_sender_waits_even_when_the_flat_is_certain():
    decision = route(trusted_sender=False)
    assert decision.group_id is None
    assert decision.reason is BillReviewReason.UNKNOWN_SENDER
    # The flat is still worked out, so approving it is one tap.
    assert decision.suggested_group_id == A


def test_a_fixed_recurring_bill_of_the_same_kind_waits():
    decision = route(flats=[FlatFacts(A, None, has_fixed_recurring=True)])
    assert decision.reason is BillReviewReason.RECURRING_CONFLICT
    assert decision.suggested_group_id == A


@pytest.mark.parametrize(
    ("sender", "trusted"),
    [
        ("noreply@iec.co.il", True),
        ("bills@billing.iec.co.il", True),
        ("Israel Electric <noreply@iec.co.il>", True),
        ("NoReply@IEC.CO.IL", True),
        ("attacker@fake-iec.co.il", False),
        ("attacker@iec.co.il.evil.com", False),
        ("someone@gmail.com", False),
        ("", False),
        (None, False),
        ("not-an-email", False),
    ],
)
def test_only_listed_utility_domains_are_trusted(sender, trusted):
    assert sender_is_trusted(sender, ["iec.co.il", "bezeq.co.il"]) is trusted
