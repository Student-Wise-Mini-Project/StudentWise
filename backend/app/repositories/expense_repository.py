"""Expense queries. Builds queries and flushes -- never commits."""

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.expense import Expense, ExpenseSplit


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
        category: str | None = None,
        payer_id: uuid.UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[Expense]:
        stmt = select(Expense).where(Expense.group_id == group_id)
        if category is not None:
            stmt = stmt.where(Expense.category == category)
        if payer_id is not None:
            stmt = stmt.where(Expense.payer_id == payer_id)
        if date_from is not None:
            stmt = stmt.where(Expense.expense_date >= date_from)
        if date_to is not None:
            stmt = stmt.where(Expense.expense_date <= date_to)

        stmt = (
            stmt.order_by(Expense.expense_date.desc(), Expense.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(self.db.scalars(stmt).unique())

    def user_appears_in_any_split(self, group_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        stmt = (
            select(ExpenseSplit.id)
            .join(Expense, Expense.id == ExpenseSplit.expense_id)
            .where(Expense.group_id == group_id, ExpenseSplit.user_id == user_id)
            .limit(1)
        )
        return self.db.scalars(stmt).first() is not None

    def add(self, expense: Expense) -> Expense:
        self.db.add(expense)
        self.db.flush()
        return expense

    def delete(self, expense: Expense) -> None:
        self.db.delete(expense)
        self.db.flush()
