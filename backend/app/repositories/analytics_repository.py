"""Aggregate queries behind analytics. Read-only -- never commits.

Every query here has two modes:

* **group scope** (`user_id=None`) sums `expenses.total_amount` -- what the group
  spent in total.
* **personal scope** sums that user's `expense_splits.owed_amount` -- what *they*
  consumed, which is a different number and the one a person actually cares about.

Keeping both behind one switch is why the endpoints can serve a group chart and a
"my spending" chart without duplicating the aggregation logic.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.models.expense import Expense, ExpenseSplit


class AnalyticsRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _scoped(
        self,
        columns: list,
        group_id: uuid.UUID,
        user_id: uuid.UUID | None,
        date_from: date | None,
        date_to: date | None,
    ) -> Select:
        """Build a select over the right table for the requested scope."""
        stmt = select(*columns).select_from(Expense)
        if user_id is not None:
            stmt = stmt.join(ExpenseSplit, ExpenseSplit.expense_id == Expense.id).where(
                ExpenseSplit.user_id == user_id
            )
        stmt = stmt.where(Expense.group_id == group_id)
        if date_from is not None:
            stmt = stmt.where(Expense.expense_date >= date_from)
        if date_to is not None:
            stmt = stmt.where(Expense.expense_date <= date_to)
        return stmt

    @staticmethod
    def _amount(user_id: uuid.UUID | None):
        return Expense.total_amount if user_id is None else ExpenseSplit.owed_amount

    def totals(
        self,
        group_id: uuid.UUID,
        *,
        user_id: uuid.UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> tuple[Decimal, int, date | None, date | None]:
        """(total spent, number of expenses, earliest date, latest date)."""
        amount = self._amount(user_id)
        stmt = self._scoped(
            [
                func.coalesce(func.sum(amount), 0),
                func.count(Expense.id),
                func.min(Expense.expense_date),
                func.max(Expense.expense_date),
            ],
            group_id,
            user_id,
            date_from,
            date_to,
        )
        total, count, first, last = self.db.execute(stmt).one()
        return Decimal(total), count, first, last

    def largest_expense(
        self,
        group_id: uuid.UUID,
        *,
        user_id: uuid.UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> Expense | None:
        amount = self._amount(user_id)
        stmt = (
            self._scoped([Expense], group_id, user_id, date_from, date_to)
            .order_by(amount.desc(), Expense.id)
            .limit(1)
        )
        return self.db.scalars(stmt).unique().first()

    def by_category(
        self,
        group_id: uuid.UUID,
        *,
        user_id: uuid.UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[tuple[str | None, Decimal, int]]:
        amount = self._amount(user_id)
        stmt = self._scoped(
            [Expense.category, func.sum(amount), func.count(Expense.id)],
            group_id,
            user_id,
            date_from,
            date_to,
        ).group_by(Expense.category)
        rows = self.db.execute(stmt).all()
        return sorted(
            [(category, Decimal(total), count) for category, total, count in rows],
            key=lambda row: (-row[1], row[0] or ""),
        )

    def by_month(
        self,
        group_id: uuid.UUID,
        *,
        user_id: uuid.UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[tuple[datetime, Decimal, int]]:
        amount = self._amount(user_id)
        month = func.date_trunc("month", Expense.expense_date).label("month")
        stmt = (
            self._scoped(
                [month, func.sum(amount), func.count(Expense.id)],
                group_id,
                user_id,
                date_from,
                date_to,
            )
            .group_by(month)
            .order_by(month)
        )
        return [(bucket, Decimal(total), count) for bucket, total, count in self.db.execute(stmt)]

    def paid_by_member(
        self,
        group_id: uuid.UUID,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> dict[uuid.UUID, Decimal]:
        """What each person laid out, by being the payer."""
        stmt = self._scoped(
            [Expense.payer_id, func.sum(Expense.total_amount)],
            group_id,
            None,
            date_from,
            date_to,
        ).group_by(Expense.payer_id)
        return {user_id: Decimal(total) for user_id, total in self.db.execute(stmt)}

    def consumed_by_member(
        self,
        group_id: uuid.UUID,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> dict[uuid.UUID, Decimal]:
        """Each person's own share of the group's expenses."""
        stmt = (
            select(ExpenseSplit.user_id, func.sum(ExpenseSplit.owed_amount))
            .select_from(ExpenseSplit)
            .join(Expense, Expense.id == ExpenseSplit.expense_id)
            .where(Expense.group_id == group_id)
        )
        if date_from is not None:
            stmt = stmt.where(Expense.expense_date >= date_from)
        if date_to is not None:
            stmt = stmt.where(Expense.expense_date <= date_to)
        stmt = stmt.group_by(ExpenseSplit.user_id)
        return {user_id: Decimal(total) for user_id, total in self.db.execute(stmt)}
