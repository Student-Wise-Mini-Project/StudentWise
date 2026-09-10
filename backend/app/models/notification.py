"""In-app notifications: one row per person who needs to hear about something."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import NotificationKind, enum_column
from app.models.user import User


class Notification(Base):
    """Something that happened, addressed to one person.

    Fan-out is on write: an expense shared by four people creates three rows,
    one per participant who is not the person who entered it. That costs a
    handful of small inserts and makes the read path -- the one the app hits on
    every screen -- a single indexed lookup by user.

    No wording is stored. `kind` plus `payload` carries the facts (who, how
    much, what it was called) and the text is rendered when the notification is
    read, so the app can be shown in Hebrew without rewriting old rows.

    The two optional foreign keys cascade: expenses and settlements are
    hard-deleted in this system, and a notification pointing at a row that no
    longer exists would be a dead link in the UI.
    """

    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_user_id_created_at", "user_id", "created_at"),
        # Drives the unread badge, which is requested on nearly every screen.
        Index("ix_notifications_user_id_read_at", "user_id", "read_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    #: Who is being told.
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    #: Who caused it. Null only if the system itself did.
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    group_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), nullable=False
    )

    kind: Mapped[NotificationKind] = mapped_column(enum_column(NotificationKind), nullable=False)
    #: The facts needed to render this notification in any language.
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")

    expense_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("expenses.id", ondelete="CASCADE"), nullable=True
    )
    settlement_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("settlements.id", ondelete="CASCADE"), nullable=True
    )

    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # clock_timestamp(), not now(): now() is the *transaction's* start time, so
    # every row written in one transaction shares it exactly and anything
    # ordered by created_at falls back to an arbitrary order. That is not
    # hypothetical -- one receipt becomes several expenses in one transaction.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp(), nullable=False
    )

    actor: Mapped[User | None] = relationship(foreign_keys=[actor_id], lazy="joined")

    @property
    def is_read(self) -> bool:
        return self.read_at is not None

    def __repr__(self) -> str:
        return f"<Notification {self.kind} to={self.user_id}>"
