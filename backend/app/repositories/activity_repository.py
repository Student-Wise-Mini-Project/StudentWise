"""Queries behind the activity feed. Builds queries -- never commits.

Everything here is ordered by `created_at`, never by `expense_date` or
`settled_at`. Those two are user-supplied and can be backdated; a feed is about
the order things happened *in the app*, and a bill someone entered today for
last month belongs at the top.
"""

import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.expense import Expense
from app.models.settlement import Settlement


class ActivityRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def recent_expenses(self, group_ids: Sequence[uuid.UUID], *, limit: int) -> list[Expense]:
        if not group_ids:
            return []
        stmt = (
            select(Expense)
            .where(Expense.group_id.in_(group_ids))
            .order_by(Expense.created_at.desc(), Expense.id.desc())
            .limit(limit)
        )
        return list(self.db.scalars(stmt).unique())

    def recent_settlements(self, group_ids: Sequence[uuid.UUID], *, limit: int) -> list[Settlement]:
        if not group_ids:
            return []
        stmt = (
            select(Settlement)
            .where(Settlement.group_id.in_(group_ids))
            .order_by(Settlement.created_at.desc(), Settlement.id.desc())
            .limit(limit)
        )
        return list(self.db.scalars(stmt).unique())

    def count(self, group_ids: Sequence[uuid.UUID]) -> int:
        """How many events exist across both tables."""
        if not group_ids:
            return 0
        expenses = self.db.scalar(
            select(func.count()).select_from(Expense).where(Expense.group_id.in_(group_ids))
        )
        settlements = self.db.scalar(
            select(func.count()).select_from(Settlement).where(Settlement.group_id.in_(group_ids))
        )
        return (expenses or 0) + (settlements or 0)
