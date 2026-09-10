"""Budget arithmetic. Pure functions, no database.

The two answers a person will argue with: what happens at exactly the limit, and
what "80% used" rounds to.
"""

from decimal import Decimal

import pytest

from app.domain.budgets import (
    BudgetLevel,
    is_worse,
    level_for,
    remaining,
    share_used,
)


def d(value: str) -> Decimal:
    return Decimal(value)


# --- where the lines are --------------------------------------------------


@pytest.mark.parametrize(
    ("spent", "limit", "expected"),
    [
        ("0.00", "1000.00", BudgetLevel.OK),
        ("799.99", "1000.00", BudgetLevel.OK),
        ("800.00", "1000.00", BudgetLevel.WARNING),
        ("999.99", "1000.00", BudgetLevel.WARNING),
        ("1000.00", "1000.00", BudgetLevel.EXCEEDED),
        ("1000.01", "1000.00", BudgetLevel.EXCEEDED),
        ("5000.00", "1000.00", BudgetLevel.EXCEEDED),
    ],
)
def test_the_thresholds(spent, limit, expected):
    assert level_for(d(spent), d(limit)) is expected


def test_spending_exactly_the_budget_counts_as_over():
    """The next coffee is over it. A budget that only complains at 100.01 is one
    nobody notices in time."""
    assert level_for(d("1000.00"), d("1000.00")) is BudgetLevel.EXCEEDED


def test_the_warning_threshold_can_be_moved():
    assert level_for(d("500.00"), d("1000.00")) is BudgetLevel.OK
    assert level_for(d("500.00"), d("1000.00"), warning_threshold=d("0.5")) is BudgetLevel.WARNING


def test_a_zero_budget_does_not_divide_by_zero():
    assert level_for(d("0.00"), d("0.00")) is BudgetLevel.OK
    assert level_for(d("0.01"), d("0.00")) is BudgetLevel.EXCEEDED
    assert share_used(d("500.00"), d("0.00")) == d("0.0")


# --- the numbers people read ----------------------------------------------


@pytest.mark.parametrize(
    ("spent", "limit", "expected"),
    [
        ("0.00", "1000.00", "0.0"),
        ("333.00", "1000.00", "33.3"),
        ("333.34", "1000.00", "33.3"),
        ("1000.00", "1000.00", "100.0"),
        ("1500.00", "1000.00", "150.0"),
        ("100.00", "300.00", "33.3"),
    ],
)
def test_share_used_is_one_decimal_place(spent, limit, expected):
    assert share_used(d(spent), d(limit)) == d(expected)


def test_remaining_goes_negative_once_it_is_blown():
    """ "How far over are we" is what people actually want to know."""
    assert remaining(d("400.00"), d("1000.00")) == d("600.00")
    assert remaining(d("1000.00"), d("1000.00")) == d("0.00")
    assert remaining(d("1250.50"), d("1000.00")) == d("-250.50")


def test_money_stays_exact():
    assert remaining(d("0.10"), d("0.30")) == d("0.20")


# --- deciding whether to say anything again -------------------------------


def test_nothing_has_been_said_yet():
    assert is_worse(BudgetLevel.WARNING, None) is True
    assert is_worse(BudgetLevel.EXCEEDED, None) is True
    assert is_worse(BudgetLevel.OK, None) is False


def test_only_getting_worse_is_worth_repeating():
    assert is_worse(BudgetLevel.EXCEEDED, BudgetLevel.WARNING) is True
    assert is_worse(BudgetLevel.WARNING, BudgetLevel.WARNING) is False
    assert is_worse(BudgetLevel.WARNING, BudgetLevel.EXCEEDED) is False
    assert is_worse(BudgetLevel.EXCEEDED, BudgetLevel.EXCEEDED) is False
