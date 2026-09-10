"""Balance and settlement-plan schemas."""

import uuid
from decimal import Decimal

from pydantic import BaseModel

from app.schemas.user import UserOut


class UserBalanceOut(BaseModel):
    user: UserOut
    paid: Decimal
    owed: Decimal
    settlements_sent: Decimal
    settlements_received: Decimal
    # Positive: the group owes this person. Negative: they owe the group.
    net: Decimal


class GroupBalancesOut(BaseModel):
    group_id: uuid.UUID
    currency: str
    balances: list[UserBalanceOut]


class PlannedTransferOut(BaseModel):
    from_user: UserOut
    to_user: UserOut
    amount: Decimal


class SettlementPlanOut(BaseModel):
    group_id: uuid.UUID
    currency: str
    transfers: list[PlannedTransferOut]
