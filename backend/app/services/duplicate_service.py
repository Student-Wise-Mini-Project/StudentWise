"""Duplicate-payment detection over a group's expenses. Read-only.

"Did we pay this twice?" -- the question from the original spec. Distinct from
anomaly detection, which asks whether *one* expense is unlike its own history.

The whole history is scanned, not just the window being reported on, because a
duplicate straddles dates: an expense entered on the 3rd and its twin on the 1st
are one event, and filtering the history to "September" first would hide the
pairs at either edge. `date_from` / `date_to` narrow what comes back, exactly as
they do for anomalies.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.domain.duplicates import (
    DEFAULT_MIN_SCORE,
    DEFAULT_WINDOW_DAYS,
    Candidate,
    find_duplicates,
)
from app.models.expense import Expense
from app.models.group import Group
from app.repositories.analytics_repository import AnalyticsRepository


@dataclass(frozen=True)
class SuspectedDuplicate:
    first: Expense
    second: Expense
    score: Decimal
    day_gap: int
    same_payer: bool
    reasons: tuple[str, ...]


def detect(
    db: Session,
    group: Group,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    window_days: int = DEFAULT_WINDOW_DAYS,
    min_score: Decimal = DEFAULT_MIN_SCORE,
) -> list[SuspectedDuplicate]:
    """Pairs of expenses that look like one payment recorded twice.

    Suggestions only -- nothing is deleted or merged. Two coffees at 12.00 on
    the same day look exactly like a double tap and are not one, so the decision
    stays with a person.
    """
    expenses = {e.id: e for e in AnalyticsRepository(db).expense_history(group.id)}

    pairs = find_duplicates(
        (
            Candidate(
                key=expense.id,
                amount=expense.total_amount,
                when=expense.expense_date,
                title=expense.title,
                payer_key=expense.payer_id,
            )
            for expense in expenses.values()
        ),
        window_days=window_days,
        min_score=min_score,
    )

    found: list[SuspectedDuplicate] = []
    for pair in pairs:
        first, second = expenses[pair.first_key], expenses[pair.second_key]

        # A pair is reported if *either* side falls in the window: hiding half a
        # pair would leave the report saying an expense duplicates nothing.
        if date_from is not None and max(first.expense_date, second.expense_date) < date_from:
            continue
        if date_to is not None and min(first.expense_date, second.expense_date) > date_to:
            continue

        found.append(
            SuspectedDuplicate(
                first=first,
                second=second,
                score=pair.score,
                day_gap=pair.day_gap,
                same_payer=pair.same_payer,
                reasons=pair.reasons,
            )
        )
    return found
