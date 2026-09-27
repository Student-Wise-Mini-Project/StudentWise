"""Expense request/response schemas."""

import json
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator

from app.models.enums import ExpenseCategory, ExpenseSource, SplitType
from app.schemas.split_rule import SplitRuleSummary
from app.schemas.user import UserOut


class ParticipantIn(BaseModel):
    """One participant. `share_value` is a percentage, a weight or an exact
    amount depending on the expense's split_type, and is ignored for EQUAL."""

    user_id: uuid.UUID
    share_value: Decimal | None = None


#: Enough for what OCR, voice or email ingestion record about where an expense
#: came from; small enough that nobody can park a document in the column.
AI_METADATA_MAX_BYTES = 16_000


class ItemIn(BaseModel):
    """One receipt line. `user_ids` names who shared it; empty means everyone."""

    name: str = Field(min_length=1, max_length=200)
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    user_ids: list[uuid.UUID] = Field(default_factory=list)


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
    #: Set false to split equally even when a standing rule would have applied.
    apply_split_rule: bool = True
    #: Split line by line instead. The server works out each person's share and
    #: stores it as an EXACT split, so send `split_type: EXACT` and no
    #: `participants`. The gap between the lines and the total is spread in
    #: proportion to what each person's lines came to.
    items: list[ItemIn] | None = Field(default=None, min_length=1, max_length=200)
    #: Where an ingested expense came from: what OCR read, before anyone edited it.
    ai_metadata: dict[str, Any] | None = None

    @model_validator(mode="after")
    def _items_decide_the_split(self) -> "ExpenseCreate":
        if self.items is not None:
            if self.participants is not None:
                raise ValueError("Send items or participants, not both")
            if self.split_type is not SplitType.EXACT:
                raise ValueError("An expense split by items is an EXACT split")
        if (
            self.ai_metadata is not None
            and len(json.dumps(self.ai_metadata, default=str)) > AI_METADATA_MAX_BYTES
        ):
            raise ValueError("ai_metadata is too large")
        return self


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


class ExpenseItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    amount: Decimal
    users: list[UserOut]


class ItemPreviewRequest(BaseModel):
    total_amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    items: list[ItemIn] = Field(min_length=1, max_length=200)


class ItemPreviewSplit(BaseModel):
    user_id: uuid.UUID
    owed_amount: Decimal


class ItemPreviewOut(BaseModel):
    #: What each person would owe, exactly as saving would store it.
    splits: list[ItemPreviewSplit]
    items_total: Decimal
    #: `total_amount - items_total`: a service charge if positive, a discount
    #: if negative. Spread in proportion to each person's lines.
    adjustment: Decimal


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
    ai_metadata: dict[str, Any] | None = None
    #: Which standing rule decided this split, if one did.
    split_rule: SplitRuleSummary | None = None
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    splits: list[ExpenseSplitOut] = []
    #: Receipt lines, if the split was worked out line by line. The amounts
    #: people owe are in `splits` either way.
    items: list[ExpenseItemOut] = []

    #: The storage key, which is nobody's business outside the server: it says
    #: where the file lives, and that changes when storage does.
    receipt_image_url: str | None = Field(default=None, exclude=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def receipt_url(self) -> str | None:
        """Where to fetch the receipt, or null if there isn't one.

        A real endpoint rather than a static path: receipts are only visible to
        members of the group, so they cannot be served straight off disk.
        """
        return f"/api/expenses/{self.id}/receipt" if self.receipt_image_url else None
