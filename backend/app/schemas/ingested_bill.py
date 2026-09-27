"""Schemas for bills found in email."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import BillReviewReason, ExpenseCategory, IngestedBillStatus


class BillGroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    currency: str


class IngestedBillOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: IngestedBillStatus
    #: Why it was not split automatically. A code, for the client to phrase.
    review_reason: BillReviewReason | None = None
    sender: str | None = None
    subject: str | None = None
    received_at: datetime | None = None
    provider_name: str | None = None
    total_amount: Decimal | None = None
    currency: str | None = None
    due_date: date | None = None
    billed_to_name: str | None = None
    service_address: str | None = None
    invoice_number: str | None = None
    category: ExpenseCategory | None = None
    #: The flat it went to, or the one suggested for review.
    group: BillGroupOut | None = None
    address_score: int | None = None
    expense_id: uuid.UUID | None = None
    created_at: datetime


class BillApprove(BaseModel):
    group_id: uuid.UUID
    #: Required when the amount could not be read from the bill; otherwise it
    #: replaces what was read.
    total_amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
