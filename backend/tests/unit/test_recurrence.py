"""Recurrence date maths. Pure functions, no database.

The case this module exists for is the 31st: a bill due on the 31st must land on
the 28th in February and then go back to the 31st in March, rather than walking
backwards through the year.
"""

from datetime import date

import pytest

from app.domain.recurrence import (
    RecurrenceFrequency,
    add_months,
    catch_up,
    clamp_to_month,
    is_due,
    is_reminder_due,
    next_due,
)

MONTHLY = RecurrenceFrequency.MONTHLY
EVERY_2 = RecurrenceFrequency.EVERY_2_MONTHS
QUARTERLY = RecurrenceFrequency.QUARTERLY
YEARLY = RecurrenceFrequency.YEARLY


# --- clamping -------------------------------------------------------------


@pytest.mark.parametrize(
    ("year", "month", "day", "expected"),
    [
        (2026, 1, 31, date(2026, 1, 31)),
        (2026, 2, 31, date(2026, 2, 28)),
        (2028, 2, 31, date(2028, 2, 29)),  # leap year
        (2026, 4, 31, date(2026, 4, 30)),
        (2026, 6, 15, date(2026, 6, 15)),
    ],
)
def test_a_day_that_does_not_exist_falls_back_to_the_last_one(year, month, day, expected):
    assert clamp_to_month(year, month, day) == expected


# --- stepping forward -----------------------------------------------------


@pytest.mark.parametrize(
    ("frequency", "expected"),
    [
        (MONTHLY, date(2026, 10, 5)),
        (EVERY_2, date(2026, 11, 5)),
        (QUARTERLY, date(2026, 12, 5)),
        (YEARLY, date(2027, 9, 5)),
    ],
)
def test_each_frequency_steps_the_right_distance(frequency, expected):
    assert next_due(date(2026, 9, 5), frequency) == expected


def test_stepping_over_the_year_boundary():
    assert next_due(date(2026, 12, 15), MONTHLY) == date(2027, 1, 15)
    assert next_due(date(2026, 11, 15), QUARTERLY) == date(2027, 2, 15)


def test_a_bill_due_on_the_31st_does_not_walk_backwards(monkeypatch=None):
    """The reason this module exists.

    Without a separate anchor day, February's clamped 28th becomes March's
    anchor and the bill loses three days a year, permanently.
    """
    anchor = 31
    due = date(2026, 1, 31)

    february = next_due(due, MONTHLY, anchor_day=anchor)
    assert february == date(2026, 2, 28)

    march = next_due(february, MONTHLY, anchor_day=anchor)
    assert march == date(2026, 3, 31), "March has a 31st; the bill should be back on it"


def test_without_an_anchor_the_current_day_is_used():
    assert next_due(date(2026, 1, 15), MONTHLY) == date(2026, 2, 15)


def test_a_february_leap_day_anchors_sensibly():
    assert next_due(date(2028, 2, 29), YEARLY, anchor_day=29) == date(2029, 2, 28)


@pytest.mark.parametrize("anchor", [0, 32, -1])
def test_a_nonsense_anchor_is_a_programming_error(anchor):
    with pytest.raises(ValueError, match="anchor_day"):
        next_due(date(2026, 9, 5), MONTHLY, anchor_day=anchor)


def test_add_months_handles_long_jumps():
    assert add_months(date(2026, 9, 5), 24, anchor_day=5) == date(2028, 9, 5)
    assert add_months(date(2026, 1, 31), 13, anchor_day=31) == date(2027, 2, 28)


# --- catching up ----------------------------------------------------------


def test_a_bill_months_behind_is_brought_forward():
    """Nothing runs on a scheduler, so a bill can be badly overdue when somebody
    finally opens the app."""
    caught = catch_up(date(2026, 1, 5), MONTHLY, today=date(2026, 9, 20), anchor_day=5)
    assert caught == date(2026, 10, 5)


def test_catching_up_keeps_the_anchor_day():
    caught = catch_up(date(2026, 1, 31), MONTHLY, today=date(2026, 6, 15), anchor_day=31)
    assert caught == date(2026, 6, 30)

    further = catch_up(caught, MONTHLY, today=date(2026, 6, 30), anchor_day=31)
    assert further == date(2026, 7, 31)


def test_a_date_due_today_is_advanced_past_it():
    assert catch_up(date(2026, 9, 5), MONTHLY, today=date(2026, 9, 5)) == date(2026, 10, 5)


def test_a_future_date_is_left_alone():
    future = date(2026, 12, 1)
    assert catch_up(future, MONTHLY, today=date(2026, 9, 5)) == future


# --- what counts as due ---------------------------------------------------


@pytest.mark.parametrize(
    ("due", "today", "expected"),
    [
        (date(2026, 9, 5), date(2026, 9, 5), True),
        (date(2026, 9, 5), date(2026, 9, 6), True),
        (date(2026, 9, 5), date(2026, 9, 4), False),
    ],
)
def test_due_today_or_overdue(due, today, expected):
    assert is_due(due, today=today) is expected


@pytest.mark.parametrize(
    ("due", "today", "days_before", "expected"),
    [
        (date(2026, 9, 10), date(2026, 9, 7), 3, True),
        (date(2026, 9, 10), date(2026, 9, 6), 3, False),
        (date(2026, 9, 10), date(2026, 9, 10), 3, True),
        (date(2026, 9, 1), date(2026, 9, 10), 3, True),  # already overdue
        (date(2026, 9, 10), date(2026, 9, 10), 0, True),
        (date(2026, 9, 11), date(2026, 9, 10), 0, False),
    ],
)
def test_when_a_reminder_is_worth_sending(due, today, days_before, expected):
    assert is_reminder_due(due, today=today, days_before=days_before) is expected


def test_a_negative_reminder_window_is_a_programming_error():
    with pytest.raises(ValueError, match="days_before"):
        is_reminder_due(date(2026, 9, 10), today=date(2026, 9, 1), days_before=-1)
