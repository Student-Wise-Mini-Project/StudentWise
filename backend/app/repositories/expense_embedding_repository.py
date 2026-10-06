"""Expense-embedding queries. Builds queries and flushes -- never commits."""

import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
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

    def save(
        self, *, expense_id: uuid.UUID, model: str, text_hash: str, dimensions: int, vector: bytes
    ) -> None:
        """Insert, or replace the one already there.

        One statement, not a read then a write: two flatmates searching a group
        for the first time at the same moment would otherwise both find no row,
        both insert, and one of them would get a primary-key error mid-chat.
        """
        values = {
            "model": model,
            "text_hash": text_hash,
            "dimensions": dimensions,
            "vector": vector,
        }
        self.db.execute(
            insert(ExpenseEmbedding)
            .values(expense_id=expense_id, **values)
            .on_conflict_do_update(index_elements=[ExpenseEmbedding.expense_id], set_=values)
        )
        self.db.flush()
