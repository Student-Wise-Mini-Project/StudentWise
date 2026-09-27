"""A user's link to their Gmail, for reading bills."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class GmailConnection(Base):
    """One per user, at most.

    Its own table rather than a column on `users`: it is a credential with its
    own lifecycle (connected, broken, revoked), and a user row that is read on
    every request has no business carrying one.
    """

    __tablename__ = "gmail_connections"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    #: The mailbox actually connected, which need not be the app login email.
    google_email: Mapped[str] = mapped_column(String(255), nullable=False)
    #: Fernet ciphertext of the refresh token. That token reads the whole
    #: mailbox, so a database dump must not hand it over.
    refresh_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    connected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp(), nullable=False
    )
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    #: Set when Google refuses the token -- revoked, or the 7-day expiry of an
    #: app still in Google's testing mode. The user has to connect again.
    needs_reconnect: Mapped[bool] = mapped_column(nullable=False, server_default="false")

    def __repr__(self) -> str:
        return f"<GmailConnection {self.google_email}>"
