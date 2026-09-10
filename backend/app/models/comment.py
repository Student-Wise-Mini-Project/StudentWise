"""Comments on an expense: the argument about the bill, kept next to the bill."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.user import User


class ExpenseComment(Base):
    """One message on one expense.

    Deleted with its expense (ON DELETE CASCADE) rather than left orphaned:
    expenses are hard-deleted here, and a comment about a bill that no longer
    exists has nothing to say.
    """

    __tablename__ = "expense_comments"
    __table_args__ = (
        Index("ix_expense_comments_expense_id_created_at", "expense_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    expense_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)

    body: Mapped[str] = mapped_column(Text, nullable=False)

    # clock_timestamp(), not now(): now() is the *transaction's* start time, so
    # every row written in one transaction shares it exactly and anything
    # ordered by created_at falls back to an arbitrary order. That is not
    # hypothetical -- one receipt becomes several expenses in one transaction.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    #: Set when the body has actually been changed, so the UI can show "edited"
    #: without comparing two timestamps that always differ by microseconds.
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(lazy="joined")

    def __repr__(self) -> str:
        return f"<ExpenseComment expense={self.expense_id} by={self.user_id}>"
