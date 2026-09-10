"""Settlement model: a repayment between two group members."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import SettlementMethod, enum_column
from app.models.user import User


class Settlement(Base):
    """Records a repayment: "I paid Maya back 50 shekels."

    Step 2's min-cash-flow algorithm will *suggest* rows for this table; nothing
    about the shape changes when it arrives. Without this table, balances would
    have no way to ever go back down.
    """

    __tablename__ = "settlements"
    __table_args__ = (Index("ix_settlements_group_id_settled_at", "group_id", "settled_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    group_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), nullable=False
    )
    from_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    to_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)

    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    method: Mapped[SettlementMethod] = mapped_column(
        enum_column(SettlementMethod), nullable=False, default=SettlementMethod.MANUAL
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    settled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    # clock_timestamp(), not now(): now() is the *transaction's* start time, so
    # every row written in one transaction shares it exactly and anything
    # ordered by created_at falls back to an arbitrary order. That is not
    # hypothetical -- one receipt becomes several expenses in one transaction.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp(), nullable=False
    )

    from_user: Mapped[User] = relationship(foreign_keys=[from_user_id], lazy="joined")
    to_user: Mapped[User] = relationship(foreign_keys=[to_user_id], lazy="joined")

    def __repr__(self) -> str:
        return f"<Settlement {self.from_user_id} -> {self.to_user_id} {self.amount}>"
