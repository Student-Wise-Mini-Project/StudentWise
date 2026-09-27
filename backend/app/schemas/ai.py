"""AI ingestion response schemas."""

from datetime import date
from decimal import Decimal
from typing import Any

from pydantic import BaseModel

from app.ai.receipt_ocr import ScanWarning
from app.models.enums import ExpenseCategory


class ReceiptLineOut(BaseModel):
    name: str
    amount: Decimal


class ReceiptScanOut(BaseModel):
    """A draft for a person to check. Nothing has been saved.

    Confirm it by creating an expense with `items`, `split_type: EXACT`,
    `source: OCR` and this `ai_metadata`, then attach the photo with
    `PUT /expenses/{id}/receipt`.
    """

    merchant: str | None
    expense_date: date | None
    total_amount: Decimal
    #: As printed. Only worth showing when it differs from the group's.
    currency: str | None
    category: ExpenseCategory | None
    lines: list[ReceiptLineOut]
    warnings: list[ScanWarning]
    ai_metadata: dict[str, Any]
