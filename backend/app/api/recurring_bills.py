"""Recurring-bill endpoints -- the bills that come round again."""

import uuid

from fastapi import APIRouter, status

from app.core.deps import CurrentUser, DbSession, GroupMembership
from app.schemas.expense import ExpenseOut
from app.schemas.recurring_bill import (
    GenerateRequest,
    RecurringBillCreate,
    RecurringBillOut,
    RecurringBillUpdate,
    RunResultOut,
)
from app.services import recurring_bill_service
from app.services.expense_service import ParticipantSpec

router = APIRouter(prefix="/groups", tags=["recurring bills"])


def _specs(participants) -> list[ParticipantSpec] | None:
    if participants is None:
        return None
    return [ParticipantSpec(user_id=p.user_id, share_value=p.share_value) for p in participants]


@router.get("/{group_id}/recurring-bills", response_model=list[RecurringBillOut])
def list_recurring_bills(membership: GroupMembership, db: DbSession) -> list[RecurringBillOut]:
    """Soonest due first."""
    bills = recurring_bill_service.list_bills(db, membership.group)
    return [RecurringBillOut.model_validate(b) for b in bills]


@router.post(
    "/{group_id}/recurring-bills",
    response_model=RecurringBillOut,
    status_code=status.HTTP_201_CREATED,
)
def create_recurring_bill(
    payload: RecurringBillCreate,
    membership: GroupMembership,
    current_user: CurrentUser,
    db: DbSession,
) -> RecurringBillOut:
    """Set up a bill that comes round again.

    **Leave `amount` out when the amount varies.** Rent is 3600 every month and
    can post itself; electricity is whatever the meter says, so that bill
    reminds somebody instead of inventing a number.

    Leaving `participants` out means everyone active -- or, if the group has a
    standing split rule for this category, whatever that rule says. That is how
    "rent, monthly" and "rent by room size" combine into rent that posts itself
    on the right proportions.

    `first_due_on` cannot be in the past: a schedule nobody has seen yet should
    not conjure up months of back-dated expenses on its first run.

    **Leave `occurrences_total` out for a bill that repeats forever.** Set it to
    12 and the bill posts twelve times and then reports itself finished -- it
    stops posting and stops reminding, but stays put so it can be extended or
    deleted deliberately.
    """
    bill = recurring_bill_service.create_bill(
        db,
        membership.group,
        creator=current_user,
        title=payload.title,
        frequency=payload.frequency,
        first_due_on=payload.first_due_on,
        payer_id=payload.payer_id,
        amount=payload.amount,
        category=payload.category,
        split_type=payload.split_type,
        participants=_specs(payload.participants),
        reminder_days_before=payload.reminder_days_before,
        occurrences_total=payload.occurrences_total,
    )
    return RecurringBillOut.model_validate(bill)


@router.get("/{group_id}/recurring-bills/{bill_id}", response_model=RecurringBillOut)
def get_recurring_bill(
    bill_id: uuid.UUID, membership: GroupMembership, db: DbSession
) -> RecurringBillOut:
    bill = recurring_bill_service.get_bill(db, membership.group, bill_id)
    return RecurringBillOut.model_validate(bill)


@router.patch("/{group_id}/recurring-bills/{bill_id}", response_model=RecurringBillOut)
def update_recurring_bill(
    bill_id: uuid.UUID,
    payload: RecurringBillUpdate,
    membership: GroupMembership,
    db: DbSession,
) -> RecurringBillOut:
    """Set `active: false` to pause a bill without losing its history."""
    bill = recurring_bill_service.get_bill(db, membership.group, bill_id)
    updated = recurring_bill_service.update_bill(
        db,
        membership.group,
        bill,
        title=payload.title,
        amount=payload.amount,
        clear_amount=payload.clear_amount,
        category=payload.category,
        payer_id=payload.payer_id,
        split_type=payload.split_type,
        participants=_specs(payload.participants),
        active=payload.active,
        reminder_days_before=payload.reminder_days_before,
        next_due_on=payload.next_due_on,
        occurrences_total=payload.occurrences_total,
        clear_occurrences=payload.clear_occurrences,
    )
    return RecurringBillOut.model_validate(updated)


@router.delete("/{group_id}/recurring-bills/{bill_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recurring_bill(bill_id: uuid.UUID, membership: GroupMembership, db: DbSession) -> None:
    """Expenses already posted by this bill are untouched."""
    bill = recurring_bill_service.get_bill(db, membership.group, bill_id)
    recurring_bill_service.delete_bill(db, bill)


@router.post(
    "/{group_id}/recurring-bills/{bill_id}/generate",
    response_model=ExpenseOut,
    status_code=status.HTTP_201_CREATED,
)
def generate_recurring_bill(
    bill_id: uuid.UUID,
    payload: GenerateRequest,
    membership: GroupMembership,
    current_user: CurrentUser,
    db: DbSession,
) -> ExpenseOut:
    """Post this bill once, now -- how a varying bill gets recorded.

    Send `amount` when the bill has none of its own; without it this is a 400,
    because guessing what the electricity cost would be worse than refusing.

    Posting the same bill twice for the same date is a 409, enforced by a unique
    index rather than a hopeful check.
    """
    bill = recurring_bill_service.get_bill(db, membership.group, bill_id)
    expense = recurring_bill_service.generate_now(
        db,
        membership.group,
        bill,
        creator=current_user,
        amount=payload.amount,
        expense_date=payload.expense_date,
    )
    return ExpenseOut.model_validate(expense)


@router.post("/{group_id}/recurring-bills/run", response_model=RunResultOut)
def run_recurring_bills(membership: GroupMembership, db: DbSession) -> RunResultOut:
    """Post everything due and remind about everything nearly due.

    Nothing here runs on a scheduler, so something has to call this: the app on
    load, or `python run_due_bills.py` from cron. Safe to call as often as you
    like -- a bill already posted for its due date has moved on, and a reminder
    already sent is not sent again.

    A bill that is months overdue posts one expense per period it missed. Each
    of those months really did have a rent payment in it. Those expenses are
    attributed to whoever set the bill up, not to whoever opened the app.
    """
    result = recurring_bill_service.run(db, membership.group)
    return RunResultOut(
        generated=[ExpenseOut.model_validate(e) for e in result.generated],
        awaiting_amount=[RecurringBillOut.model_validate(b) for b in result.awaiting_amount],
        reminded=[RecurringBillOut.model_validate(b) for b in result.reminded],
    )
