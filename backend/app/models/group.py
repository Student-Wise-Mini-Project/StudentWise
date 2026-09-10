"""Group and group membership models."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import GroupType, MemberRole, enum_column
from app.models.user import User


class Group(Base):
    """A shared apartment, couple, trip or solo budget.

    Currency lives here and expenses inherit it -- there is deliberately no
    per-expense currency, because mixed-currency balances are meaningless
    without exchange rates.
    """

    __tablename__ = "groups"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    type: Mapped[GroupType] = mapped_column(enum_column(GroupType), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default="ILS")

    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    members: Mapped[list["GroupMember"]] = relationship(
        back_populates="group", cascade="all, delete-orphan", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Group {self.name}>"


class GroupMember(Base):
    """Membership link. A member who leaves gets `left_at` set -- the row is never
    deleted, so past expenses and balances stay intact. Only rows with
    `left_at IS NULL` may join new splits."""

    __tablename__ = "group_members"
    __table_args__ = (Index("ix_group_members_user_id", "user_id"),)

    group_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )

    role: Mapped[MemberRole] = mapped_column(
        enum_column(MemberRole), nullable=False, default=MemberRole.MEMBER
    )
    # Used as the default weight for WEIGHT splits (e.g. 60/40 for a couple).
    default_split_weight: Mapped[Decimal] = mapped_column(
        Numeric(6, 3), nullable=False, server_default="1"
    )

    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    group: Mapped["Group"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(lazy="joined")

    @property
    def is_active(self) -> bool:
        return self.left_at is None

    def __repr__(self) -> str:
        return f"<GroupMember group={self.group_id} user={self.user_id}>"
