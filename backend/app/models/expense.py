"""Expense and expense-split models."""

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
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import ExpenseCategory, ExpenseSource, SplitType, enum_column
from app.models.group import Group
from app.models.user import User


class Expense(Base):
    """Something someone paid for on behalf of the group.

    There is no `currency` column: currency lives on the group and expenses
    inherit it. There is no `deleted_at` either -- deletes are real, and the
    splits cascade with them.
    """

    __tablename__ = "expenses"
    __table_args__ = (Index("ix_expenses_group_id_expense_date", "group_id", "expense_date"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    group_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), nullable=False
    )
    payer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    # Nullable means "nobody said". Analytics folds that in with OTHER so the
    # chart shows one unknown bucket rather than two.
    category: Mapped[ExpenseCategory | None] = mapped_column(
        enum_column(ExpenseCategory), nullable=True
    )
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)

    split_type: Mapped[SplitType] = mapped_column(enum_column(SplitType), nullable=False)
    source: Mapped[ExpenseSource] = mapped_column(
        enum_column(ExpenseSource), nullable=False, default=ExpenseSource.MANUAL
    )

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Populated from Step 3 onward (receipt OCR, voice transcripts, extraction confidence).
    receipt_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ai_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    splits: Mapped[list["ExpenseSplit"]] = relationship(
        back_populates="expense", cascade="all, delete-orphan", lazy="selectin"
    )
    payer: Mapped[User] = relationship(foreign_keys=[payer_id], lazy="joined")
    group: Mapped[Group] = relationship(lazy="joined")

    def __repr__(self) -> str:
        return f"<Expense {self.title} {self.total_amount}>"


class ExpenseSplit(Base):
    """What one participant owes on one expense.

    A row exists only for a participant, which is how "only some of the group is
    on this expense" works. Per-item receipt splitting (Step 3) will write rows
    into this same table, so balances never need to know that items exist.
    """

    __tablename__ = "expense_splits"
    __table_args__ = (
        UniqueConstraint("expense_id", "user_id", name="uq_expense_splits_expense_user"),
        Index("ix_expense_splits_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    expense_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)

    owed_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    # The raw input the user gave: a percentage, a weight or an exact amount,
    # depending on the parent expense's split_type. Null for EQUAL splits.
    share_value: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)

    expense: Mapped[Expense] = relationship(back_populates="splits")
    user: Mapped[User] = relationship(lazy="joined")

    def __repr__(self) -> str:
        return f"<ExpenseSplit user={self.user_id} owes={self.owed_amount}>"
