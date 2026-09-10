"""Budget request/response schemas."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.domain.budgets import BudgetLevel
from app.models.enums import BudgetPeriod, ExpenseCategory


class BudgetCreate(BaseModel):
    #: Omit for a ceiling on the whole group rather than one category.
    category: ExpenseCategory | None = None
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)


class BudgetUpdate(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)


class BudgetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    group_id: uuid.UUID
    category: ExpenseCategory | None = None
    amount: Decimal
    period: BudgetPeriod
    created_by: uuid.UUID
    created_at: datetime


class BudgetStatusOut(BaseModel):
    budget: BudgetOut
    #: "YYYY-MM". Which month these numbers are for.
    month: str
    spent: Decimal
    #: Negative once the budget is blown -- "how far over" is the useful number.
    remaining: Decimal
    #: Percentage, to one decimal place.
    share_used: Decimal
    level: BudgetLevel


class BudgetReportOut(BaseModel):
    group_id: uuid.UUID
    currency: str
    month: str
    budgets: list[BudgetStatusOut]
