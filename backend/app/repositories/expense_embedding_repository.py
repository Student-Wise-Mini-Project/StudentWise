"""Expense-embedding queries. Builds queries and flushes -- never commits."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.expense import Expense
from app.models.expense_embedding import ExpenseEmbedding


class ExpenseEmbeddingRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def for_group(self, group_id: uuid.UUID) -> list[tuple[Expense, ExpenseEmbedding | None]]:
        """Every expense in the group with its embedding, if it has one yet."""
        stmt = (
            select(Expense, ExpenseEmbedding)
            .outerjoin(ExpenseEmbedding, ExpenseEmbedding.expense_id == Expense.id)
            .where(Expense.group_id == group_id)
            .order_by(Expense.expense_date.desc(), Expense.id)
        )
        return [(expense, embedding) for expense, embedding in self.db.execute(stmt).unique()]

    def save(self, embedding: ExpenseEmbedding) -> None:
        # merge: inserts a new expense's row, replaces one whose text changed.
        self.db.merge(embedding)
        self.db.flush()
