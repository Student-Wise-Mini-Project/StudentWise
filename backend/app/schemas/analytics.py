"""Analytics response schemas."""

import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel

from app.domain.anomalies import AnomalyDirection
from app.models.enums import ExpenseCategory
from app.schemas.user import UserOut


class ExpenseBrief(BaseModel):
    id: uuid.UUID
    title: str
    total_amount: Decimal
    expense_date: date
    category: ExpenseCategory | None = None


class SummaryOut(BaseModel):
    group_id: uuid.UUID
    currency: str
    # "group" = what the group spent; "user" = what that person consumed.
    scope: str
    total_spent: Decimal
    expense_count: int
    average_expense: Decimal
    largest_expense: ExpenseBrief | None = None
    first_expense_date: date | None = None
    last_expense_date: date | None = None


class CategorySliceOut(BaseModel):
    category: ExpenseCategory
    total: Decimal
    expense_count: int
    share_percent: Decimal


class CategoryBreakdownOut(BaseModel):
    group_id: uuid.UUID
    currency: str
    scope: str
    total: Decimal
    categories: list[CategorySliceOut]


class MonthPointOut(BaseModel):
    month: str
    total: Decimal
    expense_count: int


class MonthlyTrendOut(BaseModel):
    group_id: uuid.UUID
    currency: str
    scope: str
    months: list[MonthPointOut]


class MemberSliceOut(BaseModel):
    user: UserOut
    paid: Decimal
    consumed: Decimal


class MemberBreakdownOut(BaseModel):
    group_id: uuid.UUID
    currency: str
    members: list[MemberSliceOut]


class AnomalyOut(BaseModel):
    expense: ExpenseBrief
    # The normalised title the series was built from, e.g. "electricity bill".
    series_label: str
    series_size: int
    # The usual amount for this series: the median of its other observations.
    baseline: Decimal
    difference: Decimal
    percent_change: Decimal
    score: Decimal
    direction: AnomalyDirection


class AnomalyReportOut(BaseModel):
    group_id: uuid.UUID
    currency: str
    anomalies: list[AnomalyOut]
