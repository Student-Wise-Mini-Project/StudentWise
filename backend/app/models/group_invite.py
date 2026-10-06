"""Invite links: join a group by opening a link someone shared.

The way in for someone the group cannot add by email -- most often because
they have no account yet. A member creates a link, shares it on WhatsApp or
by email, and whoever opens it (signing up first if they need to) joins.

The token is the only secret, so it is long and random
(`secrets.token_urlsafe`). A link works for 14 days, for anyone who has it,
until it expires or a member replaces it -- after that it is simply unknown.
Opening a link shows the group's name and who invited you, never its members
or its money: those are for members.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.user import User


class GroupInvite(Base):
    __tablename__ = "group_invites"
    __table_args__ = (Index("ix_group_invites_group_id", "group_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    group_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), nullable=False
    )
    token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    #: Set when a member replaces the link; the old one stops working at once.
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    inviter: Mapped[User] = relationship(foreign_keys=[created_by], lazy="joined")

    def is_usable(self, now: datetime) -> bool:
        return self.revoked_at is None and self.expires_at > now

    def __repr__(self) -> str:
        return f"<GroupInvite group={self.group_id} expires={self.expires_at:%Y-%m-%d}>"
