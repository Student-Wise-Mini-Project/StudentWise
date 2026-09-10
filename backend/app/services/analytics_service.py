"""Analytics. Read-only -- nothing here commits.

Scope matters throughout: with no `user_id` these numbers describe what the
*group* spent; with one they describe what that *person* consumed (their share
of each expense), which is a different figure.
"""

import uuid
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.orm import Session

from app.core.errors import BadRequestError
from app.models.expense import Expense
from app.models.group import Group
from app.models.user import User
from app.repositories.analytics_repository import AnalyticsRepository
from app.repositories.group_repository import GroupRepository

ZERO = Decimal("0.00")
UNCATEGORISED = "uncategorised"


@dataclass(frozen=True)
class CategorySlice:
    category: str
    total: Decimal
    expense_count: int
    share_percent: Decimal


@dataclass(frozen=True)
class MonthPoint:
    month: str  # "YYYY-MM"
    total: Decimal
    expense_count: int


@dataclass(frozen=True)
class MemberSlice:
    user: User
    paid: Decimal
    consumed: Decimal


@dataclass(frozen=True)
class Summary:
    total_spent: Decimal
    expense_count: int
    average_expense: Decimal
    largest_expense: Expense | None
    first_expense_date: date | None
    last_expense_date: date | None


def _require_member(db: Session, group: Group, user_id: uuid.UUID) -> None:
    if GroupRepository(db).get_membership(group.id, user_id) is None:
        raise BadRequestError("That user is not a member of this group")


def summary(
    db: Session,
    group: Group,
    *,
    user_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> Summary:
    if user_id is not None:
        _require_member(db, group, user_id)

    repo = AnalyticsRepository(db)
    total, count, first, last = repo.totals(
        group.id, user_id=user_id, date_from=date_from, date_to=date_to
    )
    average = (total / count).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if count else ZERO
    return Summary(
        total_spent=total,
        expense_count=count,
        average_expense=average,
        largest_expense=repo.largest_expense(
            group.id, user_id=user_id, date_from=date_from, date_to=date_to
        ),
        first_expense_date=first,
        last_expense_date=last,
    )


def by_category(
    db: Session,
    group: Group,
    *,
    user_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[CategorySlice]:
    """Biggest category first. Percentages are of the total in scope."""
    if user_id is not None:
        _require_member(db, group, user_id)

    rows = AnalyticsRepository(db).by_category(
        group.id, user_id=user_id, date_from=date_from, date_to=date_to
    )
    total = sum((row[1] for row in rows), ZERO)
    return [
        CategorySlice(
            category=category or UNCATEGORISED,
            total=amount,
            expense_count=count,
            share_percent=(
                (amount * 100 / total).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
                if total
                else ZERO
            ),
        )
        for category, amount, count in rows
    ]


def by_month(
    db: Session,
    group: Group,
    *,
    user_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[MonthPoint]:
    """Oldest month first, with empty months filled in as zero.

    The gap-filling matters: a line chart drawn straight from the database would
    silently join March to June and imply spending that never happened.
    """
    if user_id is not None:
        _require_member(db, group, user_id)

    rows = AnalyticsRepository(db).by_month(
        group.id, user_id=user_id, date_from=date_from, date_to=date_to
    )
    if not rows:
        return []

    found = {(bucket.year, bucket.month): (total, count) for bucket, total, count in rows}
    start = min(found)
    end = max(found)

    points = []
    year, month = start
    while (year, month) <= end:
        total, count = found.get((year, month), (ZERO, 0))
        points.append(MonthPoint(month=f"{year:04d}-{month:02d}", total=total, expense_count=count))
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return points


def by_member(
    db: Session,
    group: Group,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[MemberSlice]:
    """Per person: what they laid out, and what they actually consumed.

    Unlike balances, this does not net anything off against settlements -- it is
    a spending breakdown, not a debt position.
    """
    repo = AnalyticsRepository(db)
    paid = repo.paid_by_member(group.id, date_from=date_from, date_to=date_to)
    consumed = repo.consumed_by_member(group.id, date_from=date_from, date_to=date_to)

    slices = []
    for membership in GroupRepository(db).all_memberships(group.id):
        user_id = membership.user_id
        row = MemberSlice(
            user=membership.user,
            paid=paid.get(user_id, ZERO),
            consumed=consumed.get(user_id, ZERO),
        )
        if membership.is_active or row.paid or row.consumed:
            slices.append(row)

    slices.sort(key=lambda s: (-s.consumed, s.user.name))
    return slices
