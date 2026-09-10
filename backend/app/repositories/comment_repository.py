"""Expense-comment queries. Builds queries and flushes -- never commits."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.comment import ExpenseComment


class CommentRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, comment_id: uuid.UUID) -> ExpenseComment | None:
        return self.db.get(ExpenseComment, comment_id)

    def list_by_expense(
        self, expense_id: uuid.UUID, *, limit: int = 50, offset: int = 0
    ) -> list[ExpenseComment]:
        """Oldest first -- a thread reads top to bottom, unlike a feed."""
        stmt = (
            select(ExpenseComment)
            .where(ExpenseComment.expense_id == expense_id)
            .order_by(ExpenseComment.created_at.asc(), ExpenseComment.id.asc())
            .limit(limit)
            .offset(offset)
        )
        return list(self.db.scalars(stmt).unique())

    def count_by_expense(self, expense_id: uuid.UUID) -> int:
        stmt = (
            select(func.count())
            .select_from(ExpenseComment)
            .where(ExpenseComment.expense_id == expense_id)
        )
        return self.db.scalar(stmt) or 0

    def commenter_ids(self, expense_id: uuid.UUID) -> list[uuid.UUID]:
        """Everyone who has already said something here, so they hear the reply."""
        stmt = (
            select(ExpenseComment.user_id).where(ExpenseComment.expense_id == expense_id).distinct()
        )
        return list(self.db.scalars(stmt))

    def add(self, comment: ExpenseComment) -> ExpenseComment:
        self.db.add(comment)
        self.db.flush()
        return comment

    def delete(self, comment: ExpenseComment) -> None:
        self.db.delete(comment)
        self.db.flush()
