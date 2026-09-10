"""Idempotency keys: making a retried request harmless.

Duplicate detection (`domain/duplicates.py`) finds double payments *after* they
are recorded. This stops one class of them being recorded at all -- the class
that is not a human mistake but a network one.

A phone on the underground sends `POST /expenses`, the reply never arrives, the
app retries. Without a key that is two rent payments. With one it is a single
expense and a second identical answer.

The row is written in the *same transaction* as the thing it protects, so the
two commit together or not at all. A request that fails validation rolls its key
back with it and can be retried under the same key -- which is what someone
fixing a typo and pressing send again would expect.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class IdempotencyKey(Base):
    """One client-supplied key, and what it ended up creating.

    Scoped per user as well as per endpoint: two people are free to pick the
    same key, and one person cannot reach another's resource by guessing one.
    """

    __tablename__ = "idempotency_keys"
    __table_args__ = (
        UniqueConstraint("user_id", "scope", "key", name="uq_idempotency_user_scope_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    #: Which endpoint and which group, e.g. "expenses:<group id>".
    scope: Mapped[str] = mapped_column(String(80), nullable=False)
    key: Mapped[str] = mapped_column(String(200), nullable=False)

    #: A hash of the request body. Reusing one key for two different requests is
    #: a client bug, and answering the second with the first one's resource
    #: would hide it.
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)

    #: Filled in once the request succeeds. Null only inside the transaction
    #: that is still creating it.
    resource_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<IdempotencyKey {self.scope} {self.key}>"
