"""Bills that come round again: rent, electricity, water, the internet.

A recurring bill is a **template plus a schedule**, not an expense. It becomes
an expense when it falls due, and that expense is an ordinary row in `expenses`
with ordinary `expense_splits` -- balances, settlement and analytics never learn
that recurring bills exist. Same seam as per-item receipt splitting.

The one distinction that carries the design: `amount` may be NULL.

* **Rent is 3600 every month.** The amount is known, so the bill generates its
  expense on its own.
* **Electricity is whatever the meter says.** The amount is not known, so the
  bill *reminds* somebody to enter it and never invents a number.

Both are real, and a design that only handled fixed amounts would quietly be
useless for exactly the bills people argue about.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.domain.recurrence import RecurrenceFrequency
from app.models.enums import ExpenseCategory, SplitType, enum_column
from app.models.user import User


class RecurringBill(Base):
    __tablename__ = "recurring_bills"
    __table_args__ = (
        CheckConstraint("anchor_day BETWEEN 1 AND 31", name="ck_recurring_bills_anchor_day"),
        Index("ix_recurring_bills_next_due_on", "next_due_on"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    group_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), nullable=False
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    #: NULL means the amount varies. The bill reminds; it never guesses.
    amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    category: Mapped[ExpenseCategory | None] = mapped_column(
        enum_column(ExpenseCategory), nullable=True
    )
    payer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    split_type: Mapped[SplitType] = mapped_column(
        enum_column(SplitType), nullable=False, default=SplitType.EQUAL
    )

    frequency: Mapped[RecurrenceFrequency] = mapped_column(
        enum_column(RecurrenceFrequency), nullable=False
    )
    #: Kept apart from `next_due_on` so a bill due on the 31st comes back to the
    #: 31st after February, instead of walking backwards through the year.
    anchor_day: Mapped[int] = mapped_column(Integer, nullable=False)
    next_due_on: Mapped[date] = mapped_column(Date, nullable=False)

    #: Paused rather than deleted -- a bill that stops for the summer keeps its
    #: history and its participants.
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    reminder_days_before: Mapped[int] = mapped_column(Integer, nullable=False, server_default="3")

    last_generated_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    #: Which due date has already been reminded about, so a bill that stays
    #: overdue does not nag every time anybody opens the app.
    reminded_for: Mapped[date | None] = mapped_column(Date, nullable=True)

    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    participants: Mapped[list["RecurringBillParticipant"]] = relationship(
        back_populates="bill", cascade="all, delete-orphan", lazy="selectin"
    )
    payer: Mapped[User] = relationship(foreign_keys=[payer_id], lazy="joined")

    @property
    def generates_automatically(self) -> bool:
        """A bill with a known amount can post itself; one without cannot."""
        return self.amount is not None

    def __repr__(self) -> str:
        return f"<RecurringBill {self.title} every {self.frequency}>"


class RecurringBillParticipant(Base):
    """Who is on this bill, and on what terms.

    Mirrors `ParticipantSpec` rather than `expense_splits`: this is the input to
    a split, not a split. `share_value` means a percentage, a weight or an exact
    amount depending on the bill's `split_type`, exactly as it does on an
    expense.
    """

    __tablename__ = "recurring_bill_participants"
    __table_args__ = (
        UniqueConstraint("bill_id", "user_id", name="uq_recurring_bill_participants_bill_user"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    bill_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("recurring_bills.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    share_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)

    bill: Mapped[RecurringBill] = relationship(back_populates="participants")
    user: Mapped[User] = relationship(lazy="joined")

    def __repr__(self) -> str:
        return f"<RecurringBillParticipant user={self.user_id}>"
