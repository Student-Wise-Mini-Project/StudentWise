"""Anomaly detection over a group's expenses. Read-only.

Expenses are grouped into series by their **title**, normalised for case and
spacing, because that is what a recurring bill actually looks like in the data:
"Electricity bill" every month, "Water bill" every two. Category would be too
coarse -- UTILITIES mixes water, electricity and gas, and their combined spread
is wide enough to hide a real spike in any one of them.

An expense whose title never repeats simply never accumulates enough history to
be judged, which is the correct answer: a one-off cannot be anomalous.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.domain.anomalies import (
    DEFAULT_MIN_HISTORY,
    DEFAULT_THRESHOLD,
    AnomalyDirection,
    find_anomalies,
)
from app.models.expense import Expense
from app.models.group import Group
from app.repositories.analytics_repository import AnalyticsRepository


@dataclass(frozen=True)
class ExpenseAnomaly:
    expense: Expense
    series_label: str
    series_size: int
    baseline: Decimal
    difference: Decimal
    percent_change: Decimal
    score: Decimal
    direction: AnomalyDirection


def _series_key(title: str) -> str:
    return " ".join(title.lower().split())


def detect(
    db: Session,
    group: Group,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    direction: AnomalyDirection | None = None,
    min_history: int = DEFAULT_MIN_HISTORY,
    threshold: Decimal = DEFAULT_THRESHOLD,
) -> list[ExpenseAnomaly]:
    """Find expenses that do not look like their own history, worst first.

    `date_from` / `date_to` narrow what is *reported*, never what the baseline is
    built from. Filtering the history first would leave a short window with no
    history to compare against and quietly report nothing.
    """
    series: dict[str, list[Expense]] = {}
    for expense in AnalyticsRepository(db).expense_history(group.id):
        series.setdefault(_series_key(expense.title), []).append(expense)

    found: list[ExpenseAnomaly] = []
    for label, expenses in series.items():
        amounts = [expense.total_amount for expense in expenses]
        for anomaly in find_anomalies(amounts, threshold=threshold, min_history=min_history):
            expense = expenses[anomaly.index]
            if date_from is not None and expense.expense_date < date_from:
                continue
            if date_to is not None and expense.expense_date > date_to:
                continue
            if direction is not None and anomaly.direction is not direction:
                continue

            found.append(
                ExpenseAnomaly(
                    expense=expense,
                    series_label=label,
                    series_size=len(expenses),
                    baseline=anomaly.baseline,
                    difference=anomaly.difference,
                    percent_change=anomaly.percent_change,
                    score=anomaly.score,
                    direction=anomaly.direction,
                )
            )

    found.sort(
        key=lambda a: (-a.score, -abs(a.percent_change), a.expense.expense_date, str(a.expense.id))
    )
    return found
