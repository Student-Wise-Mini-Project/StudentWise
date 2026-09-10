"""Budget queries. Builds queries and flushes -- never commits."""

import uuid
from calendar import monthrange
from datetime import date
from decimal import Decimal

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.orm import Session

from app.models.budget import Budget
from app.models.enums import ExpenseCategory
from app.models.expense import Expense

ZERO = Decimal("0.00")


def category_filter(category: ExpenseCategory | None) -> list[ColumnElement[bool]]:
    """Which expenses a budget for `category` is measured against.

    `None` is the whole group. `OTHER` also picks up expenses nobody
    categorised, exactly as the analytics endpoints do -- two different "unknown"
    buckets would be one more thing for a person to reconcile by hand.
    """
    if category is None:
        return []
    if category is ExpenseCategory.OTHER:
        return [or_(Expense.category == ExpenseCategory.OTHER, Expense.category.is_(None))]
    return [Expense.category == category]


class BudgetRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, budget_id: uuid.UUID) -> Budget | None:
        return self.db.get(Budget, budget_id)

    def list_by_group(self, group_id: uuid.UUID) -> list[Budget]:
        """Named categories first, then the overall ceiling -- specific to
        general, the way the list reads."""
        stmt = (
            select(Budget)
            .where(Budget.group_id == group_id)
            .order_by(Budget.category.is_(None), Budget.category)
        )
        return list(self.db.scalars(stmt))

    def get_for_category(self, group_id: uuid.UUID, category: ExpenseCategory) -> Budget | None:
        stmt = select(Budget).where(Budget.group_id == group_id, Budget.category == category)
        return self.db.scalars(stmt).first()

    def get_overall(self, group_id: uuid.UUID) -> Budget | None:
        stmt = select(Budget).where(Budget.group_id == group_id, Budget.category.is_(None))
        return self.db.scalars(stmt).first()

    def spent_in_month(
        self, group_id: uuid.UUID, category: ExpenseCategory | None, *, year: int, month: int
    ) -> Decimal:
        """What the group spent in one calendar month, against one budget.

        Expense totals, not split shares: a budget is a ceiling on what leaves
        the household, not on any one person's share of it.
        """
        first = date(year, month, 1)
        last = date(year, month, monthrange(year, month)[1])

        stmt = select(func.coalesce(func.sum(Expense.total_amount), 0)).where(
            Expense.group_id == group_id,
            Expense.expense_date >= first,
            Expense.expense_date <= last,
            *category_filter(category),
        )
        return Decimal(self.db.scalar(stmt) or 0).quantize(Decimal("0.01"))

    def add(self, budget: Budget) -> Budget:
        self.db.add(budget)
        self.db.flush()
        return budget

    def delete(self, budget: Budget) -> None:
        self.db.delete(budget)
        self.db.flush()
