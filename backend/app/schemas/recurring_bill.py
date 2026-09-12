"""Recurring-bill request/response schemas."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.domain.recurrence import RecurrenceFrequency
from app.models.enums import ExpenseCategory, SplitType
from app.schemas.expense import ExpenseOut
from app.schemas.user import UserOut


class BillParticipantIn(BaseModel):
    user_id: uuid.UUID
    share_value: Decimal | None = None


class RecurringBillCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    frequency: RecurrenceFrequency
    first_due_on: date
    payer_id: uuid.UUID
    #: Omit when the amount varies. The bill will remind instead of posting.
    amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    category: ExpenseCategory | None = None
    split_type: SplitType = SplitType.EQUAL
    #: Omit to include every active member, or to let a standing split rule decide.
    participants: list[BillParticipantIn] | None = None
    reminder_days_before: int = Field(default=3, ge=0, le=60)
    #: How many times this should ever post. Omit for forever.
    occurrences_total: int | None = Field(default=None, gt=0, le=600)


class RecurringBillUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    #: Set true to turn a fixed bill back into a reminder-only one.
    clear_amount: bool = False
    category: ExpenseCategory | None = None
    payer_id: uuid.UUID | None = None
    split_type: SplitType | None = None
    participants: list[BillParticipantIn] | None = None
    #: Pause a bill for the summer without losing it.
    active: bool | None = None
    reminder_days_before: int | None = Field(default=None, ge=0, le=60)
    next_due_on: date | None = None
    #: Raise it to extend a finished bill, lower it to end one early.
    occurrences_total: int | None = Field(default=None, gt=0, le=600)
    #: Set true to go back to repeating forever. Same reason as `clear_amount`:
    #: without it, "unlimited" and "leave it alone" are the same request.
    clear_occurrences: bool = False


class GenerateRequest(BaseModel):
    """Post this bill now. The amount is required when the bill has none."""

    amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    expense_date: date | None = None


class BillParticipantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user: UserOut
    share_value: Decimal | None = None


class RecurringBillOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    group_id: uuid.UUID
    title: str
    amount: Decimal | None = None
    category: ExpenseCategory | None = None
    payer: UserOut
    split_type: SplitType
    frequency: RecurrenceFrequency
    next_due_on: date
    anchor_day: int
    active: bool
    reminder_days_before: int
    last_generated_on: date | None = None
    #: NULL means this bill repeats forever.
    occurrences_total: int | None = None
    occurrences_done: int = 0
    participants: list[BillParticipantOut] = []
    created_by: uuid.UUID
    created_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def posts_itself(self) -> bool:
        """True when the amount is known, so the bill can post on its own.

        The distinction the whole feature turns on: rent posts itself, and
        electricity waits for somebody to read the meter.
        """
        return self.amount is not None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_finished(self) -> bool:
        """Spent: every occurrence it was given has been posted.

        Separate from `active`, which only ever means a person paused it.
        """
        return (
            self.occurrences_total is not None and self.occurrences_done >= self.occurrences_total
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def occurrences_remaining(self) -> int | None:
        if self.occurrences_total is None:
            return None
        return max(self.occurrences_total - self.occurrences_done, 0)


class RunResultOut(BaseModel):
    """What one run of the scheduler actually did."""

    generated: list[ExpenseOut]
    #: Due now, but the amount varies -- these are waiting on a person.
    awaiting_amount: list[RecurringBillOut]
    reminded: list[RecurringBillOut]
