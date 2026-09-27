"""Gmail connection queries. Builds queries and flushes -- never commits."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.gmail_connection import GmailConnection


class GmailConnectionRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_for_user(self, user_id: uuid.UUID) -> GmailConnection | None:
        stmt = select(GmailConnection).where(GmailConnection.user_id == user_id)
        return self.db.scalars(stmt).first()

    def all_working(self) -> list[GmailConnection]:
        """Every connection Google has not refused. For the cron script."""
        stmt = (
            select(GmailConnection)
            .where(GmailConnection.needs_reconnect.is_(False))
            .order_by(GmailConnection.connected_at, GmailConnection.id)
        )
        return list(self.db.scalars(stmt))

    def add(self, connection: GmailConnection) -> GmailConnection:
        self.db.add(connection)
        self.db.flush()
        return connection

    def delete(self, connection: GmailConnection) -> None:
        self.db.delete(connection)
        self.db.flush()
