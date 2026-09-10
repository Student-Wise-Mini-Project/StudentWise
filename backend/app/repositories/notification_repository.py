"""Notification queries. Builds queries and flushes -- never commits."""

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import ColumnElement, func, select, update
from sqlalchemy.orm import Session

from app.models.notification import Notification


def _filters(user_id: uuid.UUID, *, unread_only: bool) -> list[ColumnElement[bool]]:
    clauses: list[ColumnElement[bool]] = [Notification.user_id == user_id]
    if unread_only:
        clauses.append(Notification.read_at.is_(None))
    return clauses


class NotificationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, notification_id: uuid.UUID) -> Notification | None:
        return self.db.get(Notification, notification_id)

    def list_for_user(
        self,
        user_id: uuid.UUID,
        *,
        unread_only: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Notification]:
        stmt = (
            select(Notification)
            .where(*_filters(user_id, unread_only=unread_only))
            .order_by(Notification.created_at.desc(), Notification.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(self.db.scalars(stmt).unique())

    def count_for_user(self, user_id: uuid.UUID, *, unread_only: bool = False) -> int:
        stmt = (
            select(func.count())
            .select_from(Notification)
            .where(*_filters(user_id, unread_only=unread_only))
        )
        return self.db.scalar(stmt) or 0

    def add_all(self, notifications: Sequence[Notification]) -> None:
        if not notifications:
            return
        self.db.add_all(notifications)
        self.db.flush()

    def mark_all_read(self, user_id: uuid.UUID) -> int:
        """Bulk UPDATE rather than loading every row: the whole point of "mark
        all read" is that there may be a lot of them."""
        stmt = (
            update(Notification)
            .where(Notification.user_id == user_id, Notification.read_at.is_(None))
            .values(read_at=datetime.now(UTC))
        )
        result = self.db.execute(stmt)
        self.db.flush()
        return result.rowcount or 0
