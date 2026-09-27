"""Receipt lines on an expense, and who shared each one.

Items are a record of *how* a split was worked out, never the split itself. The
amounts people owe are still ordinary `expense_splits` rows, computed from these
lines when the expense is written, so balances, settle-up and analytics never
need to know that items exist.
"""

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Numeric, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.user import User

if TYPE_CHECKING:
    from app.models.expense import Expense


class ExpenseItem(Base):
    """One line of a receipt: "Milk 3%, 7.90"."""

    __tablename__ = "expense_items"
    __table_args__ = (
        UniqueConstraint("expense_id", "position", name="uq_expense_items_expense_position"),
        # Discounts and service charges are the gap between the lines and the
        # total, spread across everyone. A negative line would split a discount
        # among whoever happened to be on it, which is rarely what it meant.
        CheckConstraint("amount > 0", name="ck_expense_items_amount_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    expense_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False
    )
    #: Order on the receipt, so the lines read back the way they were printed.
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    expense: Mapped["Expense"] = relationship(back_populates="items")
    splits: Mapped[list["ItemSplit"]] = relationship(
        back_populates="item", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def users(self) -> list[User]:
        return sorted((split.user for split in self.splits), key=lambda user: user.name)

    def __repr__(self) -> str:
        return f"<ExpenseItem {self.name} {self.amount}>"


class ItemSplit(Base):
    """One person on one line.

    Always written out in full: a line nobody marked is stored with every member
    of the group at the time, not with no rows. "Nobody marked it" meaning
    "everyone" would otherwise quietly start to include whoever joins next year.
    """

    __tablename__ = "item_splits"
    __table_args__ = (UniqueConstraint("item_id", "user_id", name="uq_item_splits_item_user"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("expense_items.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)

    item: Mapped[ExpenseItem] = relationship(back_populates="splits")
    user: Mapped[User] = relationship(lazy="joined")

    def __repr__(self) -> str:
        return f"<ItemSplit user={self.user_id}>"
