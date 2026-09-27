"""A bill found in someone's email, and what became of it."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import (
    BillReviewReason,
    ExpenseCategory,
    IngestedBillStatus,
    enum_column,
)
from app.models.group import Group


class IngestedBill(Base):
    """One email looked at, whether or not it turned out to be a bill.

    Deliberately *not* an expense with a status. Every query that adds up money
    reads `expenses`, and an unapproved bill must never reach one of them, so it
    lives here until a flat is decided and then becomes an ordinary expense
    through `expense_service`.

    A row per email also makes a sync safe to repeat: the unique
    (user, message) pair is what stops the same bill being split twice.
    """

    __tablename__ = "ingested_bills"
    __table_args__ = (
        UniqueConstraint("user_id", "gmail_message_id", name="uq_ingested_bills_user_message"),
        Index("ix_ingested_bills_user_status", "user_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    #: Whose mailbox it came from. They are also the payer when it is split.
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    gmail_message_id: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[IngestedBillStatus] = mapped_column(
        enum_column(IngestedBillStatus), nullable=False
    )
    review_reason: Mapped[BillReviewReason | None] = mapped_column(
        enum_column(BillReviewReason), nullable=True
    )

    # What the email was. Left empty for an email that was not a bill, so a
    # user's unrelated mail is never copied into the database.
    sender: Mapped[str | None] = mapped_column(String(320), nullable=True)
    subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # What the model read.
    provider_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    total_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    billed_to_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    service_address: Mapped[str | None] = mapped_column(String(300), nullable=True)
    invoice_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    category: Mapped[ExpenseCategory | None] = mapped_column(
        enum_column(ExpenseCategory), nullable=True
    )

    #: The flat it was matched to, or the best guess for the review screen.
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("groups.id", ondelete="SET NULL"), nullable=True
    )
    #: How well the bill's address matched the flat's, 0-100, when that decided it.
    address_score: Mapped[int | None] = mapped_column(nullable=True)
    #: Set once it has become an expense. SET NULL: deleting the expense must
    #: not delete the record that the email was already dealt with.
    expense_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("expenses.id", ondelete="SET NULL"), nullable=True
    )
    ai_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    group: Mapped[Group | None] = relationship(lazy="joined")

    def __repr__(self) -> str:
        return f"<IngestedBill {self.provider_name} {self.total_amount} {self.status}>"
