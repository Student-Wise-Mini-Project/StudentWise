"""Activity-feed schemas.

An item carries the whole expense or settlement rather than a summary, so the
home screen can render a row -- and open it -- without a second request.
"""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas.expense import ExpenseOut
from app.schemas.settlement import SettlementOut


class ActivityOut(BaseModel):
    kind: Literal["EXPENSE_ADDED", "SETTLEMENT_RECORDED"]
    occurred_at: datetime
    group_id: uuid.UUID
    group_name: str
    currency: str
    #: Exactly one of these is set, decided by `kind`.
    expense: ExpenseOut | None = None
    settlement: SettlementOut | None = None
