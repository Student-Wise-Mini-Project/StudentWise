"""Spending limits a group has set for itself.

A budget is per category and per month: "we spend at most 1200 on groceries".
`category` NULL is the whole group -- "at most 6000 a month, all in".

The alert bookkeeping lives on the row rather than in a separate table because
what has to be remembered is tiny: the last month anyone was told about, and how
bad it was then. Without it, every expense over the line would raise a fresh
notification for everybody, and the twelfth one would be ignored.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.domain.budgets import BudgetLevel
from app.models.enums import BudgetPeriod, ExpenseCategory, enum_column


class Budget(Base):
    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint("group_id", "category", name="uq_budgets_group_category"),
        # NULLs are not constrained by a UNIQUE constraint in Postgres, so the
        # whole-group budget needs its own partial index.
        Index(
            "uq_budgets_group_overall",
            "group_id",
            unique=True,
            postgresql_where=text("category IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    group_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), nullable=False
    )

    #: NULL means every category -- a ceiling on the group as a whole.
    category: Mapped[ExpenseCategory | None] = mapped_column(
        enum_column(ExpenseCategory), nullable=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    period: Mapped[BudgetPeriod] = mapped_column(
        enum_column(BudgetPeriod), nullable=False, default=BudgetPeriod.MONTHLY
    )

    #: The month ("YYYY-MM") people were last warned about, and how bad it was.
    #: Together these stop one notification per expense once the line is crossed.
    alerted_period: Mapped[str | None] = mapped_column(String(7), nullable=True)
    alerted_level: Mapped[BudgetLevel | None] = mapped_column(
        enum_column(BudgetLevel), nullable=True
    )

    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<Budget {self.category or 'ALL'} {self.amount}>"
