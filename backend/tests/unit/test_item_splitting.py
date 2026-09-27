"""Tests for splitting a receipt line by line.

The same invariant as every other split -- the amounts add up to the total, to
the cent -- plus the two things a receipt adds: a line only some people shared,
and a gap between the lines and the total (a discount, a service charge).
"""

import itertools
import uuid
from decimal import Decimal

import pytest

from app.core.errors import BadRequestError
from app.domain.splitting import ItemInput, compute_item_splits

A, B, C = (uuid.UUID(int=i) for i in (1, 2, 3))


def owed(splits) -> dict[uuid.UUID, Decimal]:
    return {s.user_id: s.owed_amount for s in splits}


def line(amount: str, *people: uuid.UUID) -> ItemInput:
    return ItemInput(amount=Decimal(amount), user_ids=tuple(people))


# --- lines, no adjustment -------------------------------------------------


def test_each_line_is_split_among_the_people_on_it():
    splits = compute_item_splits(
        Decimal("60.00"),
        [
            line("30.00", A, B, C),  # shared by all three
            line("20.00", A),  # only A
            line("10.00", B, C),  # B and C
        ],
    )
    assert owed(splits) == {
        A: Decimal("30.00"),
        B: Decimal("15.00"),
        C: Decimal("15.00"),
    }


def test_a_line_that_does_not_divide_evenly_loses_no_cent():
    splits = compute_item_splits(Decimal("10.00"), [line("10.00", A, B, C)])
    assert sorted(owed(splits).values(), reverse=True) == [
        Decimal("3.34"),
        Decimal("3.33"),
        Decimal("3.33"),
    ]


def test_the_result_is_stored_as_an_exact_split():
    splits = compute_item_splits(Decimal("20.00"), [line("20.00", A, B)])
    assert all(s.share_value == s.owed_amount for s in splits)


def test_someone_on_no_line_owes_nothing_and_gets_no_row():
    splits = compute_item_splits(Decimal("12.00"), [line("12.00", A)])
    assert owed(splits) == {A: Decimal("12.00")}


def test_splits_come_back_in_user_id_order():
    splits = compute_item_splits(Decimal("9.00"), [line("9.00", C, A, B)])
    assert [s.user_id for s in splits] == [A, B, C]


# --- the gap between the lines and the total ------------------------------


def test_a_service_charge_is_spread_by_what_each_person_ordered():
    # A ordered 80, B ordered 20; a 10% service charge follows that ratio.
    splits = compute_item_splits(
        Decimal("110.00"),
        [line("80.00", A), line("20.00", B)],
    )
    assert owed(splits) == {A: Decimal("88.00"), B: Decimal("22.00")}


def test_a_discount_is_spread_the_same_way():
    splits = compute_item_splits(
        Decimal("90.00"),
        [line("80.00", A), line("20.00", B)],
    )
    assert owed(splits) == {A: Decimal("72.00"), B: Decimal("18.00")}


def test_a_discount_that_wipes_out_the_lines_is_refused():
    # Only reachable as a total of zero, which no expense may have.
    with pytest.raises(BadRequestError, match="greater than zero"):
        compute_item_splits(Decimal("0.00"), [line("5.00", A)])


def test_a_huge_but_partial_discount_is_fine():
    splits = compute_item_splits(Decimal("0.01"), [line("5.00", A)])
    assert owed(splits) == {A: Decimal("0.01")}


def test_nobody_is_ever_left_owed_money_by_a_discount():
    # A deep discount across very uneven subtotals: the rounding must never
    # push the smallest share below zero.
    splits = compute_item_splits(
        Decimal("1.00"),
        [line("0.01", A), line("98.99", B)],
    )
    assert all(s.owed_amount >= 0 for s in splits)
    assert sum(s.owed_amount for s in splits) == Decimal("1.00")


@pytest.mark.parametrize(
    ("total", "lines"),
    [
        ("100.00", [("33.33", (A, B, C)), ("33.33", (A,)), ("33.34", (B, C))]),
        ("47.11", [("12.34", (A, B)), ("20.00", (C,)), ("10.01", (A, B, C))]),
        ("5.00", [("1.99", (A, B, C)), ("2.99", (B,))]),
        ("250.00", [("199.90", (A, B, C))]),
        ("0.03", [("0.01", (A,)), ("0.01", (B,)), ("0.01", (C,))]),
    ],
)
def test_splits_always_add_up_to_the_total(total, lines):
    splits = compute_item_splits(
        Decimal(total),
        [line(amount, *people) for amount, people in lines],
    )
    assert sum(s.owed_amount for s in splits) == Decimal(total)


def test_the_total_holds_for_every_combination_of_people_and_small_adjustments():
    groups = [p for r in (1, 2, 3) for p in itertools.combinations((A, B, C), r)]
    for first, second in itertools.product(groups, repeat=2):
        for adjustment in ("-0.07", "0.00", "0.05", "1.33"):
            total = Decimal("17.01") + Decimal("4.99") + Decimal(adjustment)
            splits = compute_item_splits(total, [line("17.01", *first), line("4.99", *second)])
            assert sum(s.owed_amount for s in splits) == total
            assert all(s.owed_amount > 0 for s in splits)


# --- what is refused ------------------------------------------------------


@pytest.mark.parametrize(
    ("items", "message"),
    [
        ([], "at least one line"),
        ([line("0.00", A)], "greater than zero"),
        ([line("-3.00", A)], "greater than zero"),
        ([line("3.00")], "at least one person"),
        ([line("3.00", A, A)], "only appear once"),
        ([line("3.001", A)], "sub-cent"),
    ],
)
def test_bad_lines_are_refused(items, message):
    with pytest.raises(BadRequestError, match=message):
        compute_item_splits(Decimal("3.00"), items)
