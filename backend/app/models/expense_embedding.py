"""The embedding of one expense's text, for semantic search (mission 8.3).

Kept out of `expenses` on purpose: it is derived data with its own lifecycle
(a new model means new vectors), it is large, and seventeen modules read
`expenses` as money.

Written lazily, at search time, never when an expense is saved: saving an
expense must not depend on a third-party API being up. `text_hash` is how a
search notices that a title or note changed since the vector was made.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, LargeBinary, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ExpenseEmbedding(Base):
    __tablename__ = "expense_embeddings"

    # One per expense, gone with it.
    expense_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("expenses.id", ondelete="CASCADE"), primary_key=True
    )
    #: Which model made it. Vectors from different models are not comparable,
    #: so changing EMBEDDING_MODEL re-embeds rather than mixing them.
    model: Mapped[str] = mapped_column(String(64), nullable=False)
    #: SHA-256 of the text that was embedded.
    text_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    dimensions: Mapped[int] = mapped_column(Integer, nullable=False)
    #: float32, little-endian. Not money: rule 1 is about amounts.
    vector: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<ExpenseEmbedding {self.expense_id} {self.model}>"
