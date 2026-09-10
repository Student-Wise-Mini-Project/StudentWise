"""Split-rule request/response schemas."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.models.enums import ExpenseCategory
from app.schemas.user import UserOut


class ShareIn(BaseModel):
    user_id: uuid.UUID
    #: Square metres, nights stayed, or any other number that already exists.
    weight: Decimal = Field(gt=0, max_digits=12, decimal_places=4)


class SplitRuleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    #: Omit for a rule that claims every expense in the group.
    category: ExpenseCategory | None = None
    shares: list[ShareIn] = Field(min_length=1)


class SplitRuleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    shares: list[ShareIn] | None = Field(default=None, min_length=1)


class SplitRuleShareOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user: UserOut
    weight: Decimal


class SplitRuleSummary(BaseModel):
    """Enough to say "split by Rent by room size" without a second request."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    category: ExpenseCategory | None = None


class SplitRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    group_id: uuid.UUID
    name: str
    category: ExpenseCategory | None = None
    shares: list[SplitRuleShareOut] = []
    created_by: uuid.UUID
    created_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def share_percent(self) -> dict[str, str]:
        """What each weight actually works out to, keyed by user id.

        People write weights in square metres and nights; what they want to see
        is "Maya pays 38.9%". Computed here so nobody has to divide by hand, and
        as a string because it is a share of money.
        """
        total = sum((share.weight for share in self.shares), Decimal(0))
        if total <= 0:
            return {}
        return {str(share.user.id): f"{(share.weight / total * 100):.1f}" for share in self.shares}
