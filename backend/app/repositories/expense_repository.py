"""Expense queries. Builds queries and flushes -- never commits."""

import uuid
from datetime import date

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from app.models.enums import ExpenseCategory
from app.models.expense import Expense, ExpenseSplit


def _filters(
    group_id: uuid.UUID,
    *,
    category: ExpenseCategory | None,
    payer_id: uuid.UUID | None,
    date_from: date | None,
    date_to: date | None,
) -> list[ColumnElement[bool]]:
    """The WHERE clauses for a filtered expense list.

    Shared by `list_by_group` and `count_by_group` on purpose: a total that was
    built from a different set of filters than the page is worse than no total.
    """
    clauses: list[ColumnElement[bool]] = [Expense.group_id == group_id]
    if category is not None:
        clauses.append(Expense.category == category)
    if payer_id is not None:
        clauses.append(Expense.payer_id == payer_id)
    if date_from is not None:
        clauses.append(Expense.expense_date >= date_from)
    if date_to is not None:
        clauses.append(Expense.expense_date <= date_to)
    return clauses


class ExpenseRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, expense_id: uuid.UUID) -> Expense | None:
        return self.db.get(Expense, expense_id)

    def list_by_group(
        self,
        group_id: uuid.UUID,
        *,
        limit: int = 50,
        offset: int = 0,
        category: ExpenseCategory | None = None,
        payer_id: uuid.UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[Expense]:
        stmt = (
            select(Expense)
            .where(
                *_filters(
                    group_id,
                    category=category,
                    payer_id=payer_id,
                    date_from=date_from,
                    date_to=date_to,
                )
            )
            .order_by(Expense.expense_date.desc(), Expense.created_at.desc(), Expense.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(self.db.scalars(stmt).unique())

    def count_by_group(
        self,
        group_id: uuid.UUID,
        *,
        category: ExpenseCategory | None = None,
        payer_id: uuid.UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> int:
        stmt = (
            select(func.count())
            .select_from(Expense)
            .where(
                *_filters(
                    group_id,
                    category=category,
                    payer_id=payer_id,
                    date_from=date_from,
                    date_to=date_to,
                )
            )
        )
        return self.db.scalar(stmt) or 0

    def user_appears_in_any_split(self, group_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        stmt = (
            select(ExpenseSplit.id)
            .join(Expense, Expense.id == ExpenseSplit.expense_id)
            .where(Expense.group_id == group_id, ExpenseSplit.user_id == user_id)
            .limit(1)
        )
        return self.db.scalars(stmt).first() is not None

    def participant_ids(self, expense_id: uuid.UUID) -> list[uuid.UUID]:
        """Who is on this expense. Used to decide who hears about it."""
        stmt = select(ExpenseSplit.user_id).where(ExpenseSplit.expense_id == expense_id)
        return list(self.db.scalars(stmt))

    def add(self, expense: Expense) -> Expense:
        self.db.add(expense)
        self.db.flush()
        return expense

    def delete(self, expense: Expense) -> None:
        self.db.delete(expense)
        self.db.flush()
