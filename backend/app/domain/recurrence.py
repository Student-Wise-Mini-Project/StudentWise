"""When a recurring bill next falls due.

Pure date arithmetic: a date and a frequency in, a date out. No database, no
FastAPI, and no `dateutil` -- month stepping with clamping is a dozen lines and
one dependency fewer to explain to three people.

The whole reason this is its own module is the **anchor day**. Rent due on the
31st must not drift:

    31 Jan -> 28 Feb -> 31 Mar

If February's clamped 28th were used as the next anchor, March would land on the
28th and the bill would silently walk backwards through the year. So the day of
the month is kept separately and re-applied every time, clamped only where the
month is genuinely too short.
"""

from calendar import monthrange
from datetime import date
from enum import StrEnum

#: Israeli utility bills mostly arrive every two months, which is why that step
#: exists. Named for the interval rather than "bi-monthly", which half the world
#: reads as twice a month.
MONTHS_PER_STEP = {
    "MONTHLY": 1,
    "EVERY_2_MONTHS": 2,
    "QUARTERLY": 3,
    "YEARLY": 12,
}


class RecurrenceFrequency(StrEnum):
    MONTHLY = "MONTHLY"
    EVERY_2_MONTHS = "EVERY_2_MONTHS"
    QUARTERLY = "QUARTERLY"
    YEARLY = "YEARLY"


def clamp_to_month(year: int, month: int, day: int) -> date:
    """The given day of that month, or its last day if the month is shorter."""
    return date(year, month, min(day, monthrange(year, month)[1]))


def add_months(when: date, months: int, *, anchor_day: int) -> date:
    """Step forward whole months and re-apply the anchor day."""
    total = (when.year * 12 + (when.month - 1)) + months
    return clamp_to_month(total // 12, (total % 12) + 1, anchor_day)


def next_due(
    current: date, frequency: RecurrenceFrequency, *, anchor_day: int | None = None
) -> date:
    """The due date after `current`.

    `anchor_day` defaults to the day `current` falls on, which is right for a
    bill that has never been clamped and harmless for one that has not started
    yet.
    """
    if anchor_day is None:
        anchor_day = current.day
    if not 1 <= anchor_day <= 31:
        raise ValueError("anchor_day must be between 1 and 31")
    return add_months(current, MONTHS_PER_STEP[frequency.value], anchor_day=anchor_day)


def catch_up(
    due: date, frequency: RecurrenceFrequency, *, today: date, anchor_day: int | None = None
) -> date:
    """Advance a due date past today, however far behind it has fallen.

    Nothing here runs on a scheduler, so a bill can be months overdue when
    somebody finally opens the app. Stepping one period at a time -- rather than
    jumping straight to the next future date -- keeps the anchor day honest and
    is bounded by how long the app went unopened.
    """
    if anchor_day is None:
        anchor_day = due.day

    guard = 0
    while due <= today:
        due = next_due(due, frequency, anchor_day=anchor_day)
        guard += 1
        if guard > 1200:  # a century of monthly bills
            raise ValueError("Due date could not be advanced past today")
    return due


def is_due(due: date, *, today: date) -> bool:
    """Due today or overdue."""
    return due <= today


def is_reminder_due(due: date, *, today: date, days_before: int) -> bool:
    """Close enough to be worth mentioning -- including already overdue."""
    if days_before < 0:
        raise ValueError("days_before cannot be negative")
    return (due - today).days <= days_before
