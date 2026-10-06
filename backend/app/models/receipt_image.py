"""Receipt photos kept in Postgres, for a host whose disk does not survive a restart."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, LargeBinary, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ReceiptImage(Base):
    """The bytes of one expense's receipt.

    Only written when `RECEIPT_STORAGE=database`; the row is the database
    equivalent of the file `LocalReceiptStore` would have written, and
    `expenses.receipt_image_url` still holds the same key either way.

    Keyed by expense, because an expense has one receipt. ON DELETE CASCADE
    means deleting an expense takes its photo with it in the same statement --
    something the file on disk could never promise.
    """

    __tablename__ = "receipt_images"

    expense_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("expenses.id", ondelete="CASCADE"), primary_key=True
    )
    content_type: Mapped[str] = mapped_column(String(20), nullable=False)
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<ReceiptImage expense={self.expense_id} {self.content_type}>"
