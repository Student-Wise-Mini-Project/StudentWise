"""Settlement request/response schemas."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import SettlementMethod
from app.schemas.user import UserOut


class SettlementCreate(BaseModel):
    from_user_id: uuid.UUID
    to_user_id: uuid.UUID
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    method: SettlementMethod = SettlementMethod.MANUAL
    note: str | None = None
    settled_at: datetime | None = None


class SettlementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    group_id: uuid.UUID
    from_user: UserOut
    to_user: UserOut
    amount: Decimal
    method: SettlementMethod
    note: str | None = None
    settled_at: datetime
    created_by: uuid.UUID
    created_at: datetime
