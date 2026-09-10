"""Standing rules for how a group splits certain expenses.

`WEIGHT` splits already let someone type "Maya 50, Gal 30, Noa 20" on one
expense. A rule is the same arithmetic, agreed once and applied *automatically*
to every matching expense afterwards -- which is the part typing weights per
expense does not cover.

The two cases worth naming:

* **Rent by room size.** Weights are square metres: 14 / 12 / 10. Every expense
  in the RENT category is split that way without anyone thinking about it.
* **Cost by nights stayed.** On a trip, weights are nights: 5 / 3 / 7.

Weights, not percentages, deliberately: percentages are just weights that have
to add up to 100, so supporting both would be two ways to say one thing. Square
metres and nights are already the numbers people have.
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
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import ExpenseCategory, enum_column
from app.models.user import User


class SplitRule(Base):
    """One standing rule for one group.

    `category` NULL means "everything in this group" -- the trip case, where
    nights stayed decide every expense, not just one category.

    A group can hold at most one rule per category and at most one catch-all,
    which is what the two constraints below say. Two rules that both claim an
    expense would make the split depend on which row came back first.
    """

    __tablename__ = "split_rules"
    __table_args__ = (
        UniqueConstraint("group_id", "category", name="uq_split_rules_group_category"),
        # A UNIQUE constraint does not constrain NULLs in Postgres, so the
        # catch-all rule needs its own partial index.
        Index(
            "uq_split_rules_group_catch_all",
            "group_id",
            unique=True,
            postgresql_where=text("category IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    group_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), nullable=False
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[ExpenseCategory | None] = mapped_column(
        enum_column(ExpenseCategory), nullable=True
    )

    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    shares: Mapped[list["SplitRuleShare"]] = relationship(
        back_populates="rule", cascade="all, delete-orphan", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<SplitRule {self.name} category={self.category}>"


class SplitRuleShare(Base):
    """One person's weight under one rule."""

    __tablename__ = "split_rule_shares"
    __table_args__ = (
        UniqueConstraint("rule_id", "user_id", name="uq_split_rule_shares_rule_user"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    rule_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("split_rules.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    #: Square metres, nights stayed, or any other number people already have.
    weight: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)

    rule: Mapped[SplitRule] = relationship(back_populates="shares")
    user: Mapped[User] = relationship(lazy="joined")

    def __repr__(self) -> str:
        return f"<SplitRuleShare user={self.user_id} weight={self.weight}>"
