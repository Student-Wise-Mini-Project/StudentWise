"""Expense request/response schemas."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ExpenseCategory, ExpenseSource, SplitType
from app.schemas.user import UserOut


class ParticipantIn(BaseModel):
    """One participant. `share_value` is a percentage, a weight or an exact
    amount depending on the expense's split_type, and is ignored for EQUAL."""

    user_id: uuid.UUID
    share_value: Decimal | None = None


class ExpenseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    total_amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    expense_date: date
    payer_id: uuid.UUID
    split_type: SplitType = SplitType.EQUAL
    # Omit to include every active member of the group.
    participants: list[ParticipantIn] | None = None
    category: ExpenseCategory | None = None
    notes: str | None = None
    source: ExpenseSource = ExpenseSource.MANUAL


class ExpenseUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    total_amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    expense_date: date | None = None
    payer_id: uuid.UUID | None = None
    split_type: SplitType | None = None
    participants: list[ParticipantIn] | None = None
    category: ExpenseCategory | None = None
    notes: str | None = None


class ExpenseSplitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user: UserOut
    owed_amount: Decimal
    share_value: Decimal | None = None


class ExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    group_id: uuid.UUID
    payer: UserOut
    title: str
    total_amount: Decimal
    category: ExpenseCategory | None = None
    expense_date: date
    split_type: SplitType
    source: ExpenseSource
    notes: str | None = None
    receipt_image_url: str | None = None
    ai_metadata: dict[str, Any] | None = None
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    splits: list[ExpenseSplitOut] = []
