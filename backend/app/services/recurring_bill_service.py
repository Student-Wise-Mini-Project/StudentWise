"""Recurring-bill business rules. Owns the transaction.

Nothing here runs on a scheduler. There is no Celery, no APScheduler, and adding
one for a student project would be a service to keep alive for the sake of a
`while` loop. Instead the work is idempotent and triggered:

* `POST /groups/{id}/recurring-bills/run` -- the app calls it on load
* `python run_due_bills.py` -- a real cron, or a GitHub Action, when there is one

Running twice in a minute costs one query and changes nothing, which is what
makes that safe. Running late costs nothing either: a bill three months overdue
generates the three expenses it owes, one per period it missed, because each of
those months really did have a rent payment in it.

Any active member can keep these. Adding a recurring bill is the same act as
adding an expense, which any member may do -- unlike a split rule or a budget,
which set policy for everyone and are owner-only.
"""

import uuid
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import BadRequestError, ConflictError, NotFoundError
from app.domain.recurrence import (
    RecurrenceFrequency,
    is_reminder_due,
    next_due,
)
from app.models.enums import ExpenseCategory, ExpenseSource, NotificationKind, SplitType
from app.models.expense import Expense
from app.models.group import Group
from app.models.recurring_bill import RecurringBill, RecurringBillParticipant
from app.models.user import User
from app.repositories.group_repository import GroupRepository
from app.repositories.recurring_bill_repository import RecurringBillRepository
from app.services import expense_service, notification_service
from app.services.expense_service import ParticipantSpec

#: A safety rail on catching up, not a business rule. `first_due_on` cannot be
#: created in the past, so a bill only falls this far behind if the app went
#: unopened for two years -- at which point stopping and saying so beats
#: silently posting two dozen expenses.
MAX_PERIODS_PER_RUN = 24

#: How far ahead `run` looks for bills worth mentioning.
REMINDER_HORIZON_DAYS = 31


@dataclass
class RunResult:
    """What one run actually did, so the caller can say so."""

    generated: list[Expense] = field(default_factory=list)
    #: Due, but the amount varies -- somebody has to type it in.
    awaiting_amount: list[RecurringBill] = field(default_factory=list)
    reminded: list[RecurringBill] = field(default_factory=list)


def _validated_participants(
    db: Session, group: Group, participants: list[ParticipantSpec]
) -> list[RecurringBillParticipant]:
    active = {m.user_id for m in GroupRepository(db).active_members(group.id)}
    seen: set[uuid.UUID] = set()
    rows = []
    for participant in participants:
        if participant.user_id in seen:
            raise BadRequestError("Each person can appear on a bill only once")
        seen.add(participant.user_id)
        if participant.user_id not in active:
            raise BadRequestError(
                f"User {participant.user_id} is not an active member of this group"
            )
        rows.append(
            RecurringBillParticipant(
                user_id=participant.user_id, share_value=participant.share_value
            )
        )
    return rows


def _author_of(db: Session, bill: RecurringBill) -> User:
    """Whoever set the bill up. They own what it posts."""
    author = db.get(User, bill.created_by)
    if author is None:  # pragma: no cover -- users are never hard-deleted
        raise NotFoundError("The person who created this bill no longer exists")
    return author


def get_bill(db: Session, group: Group, bill_id: uuid.UUID) -> RecurringBill:
    bill = RecurringBillRepository(db).get(bill_id)
    if bill is None or bill.group_id != group.id:
        raise NotFoundError("Recurring bill not found")
    return bill


def list_bills(db: Session, group: Group) -> list[RecurringBill]:
    return RecurringBillRepository(db).list_by_group(group.id)


def create_bill(
    db: Session,
    group: Group,
    *,
    creator: User,
    title: str,
    frequency: RecurrenceFrequency,
    first_due_on: date,
    payer_id: uuid.UUID,
    amount: Decimal | None = None,
    category: ExpenseCategory | None = None,
    split_type: SplitType = SplitType.EQUAL,
    participants: list[ParticipantSpec] | None = None,
    reminder_days_before: int = 3,
    today: date | None = None,
) -> RecurringBill:
    today = today or date.today()

    if first_due_on < today:
        # Backdating would make the first run post every period since then. If
        # those expenses are real they should be entered as expenses, not
        # conjured by a schedule nobody has seen yet.
        raise BadRequestError("The first due date cannot be in the past")
    if amount is not None and amount <= 0:
        raise BadRequestError("A bill amount must be greater than zero")
    if reminder_days_before < 0:
        raise BadRequestError("Reminder days cannot be negative")

    if GroupRepository(db).get_membership(group.id, payer_id) is None:
        raise BadRequestError("The payer must be a member of this group")

    bill = RecurringBill(
        group_id=group.id,
        title=title.strip(),
        amount=amount,
        category=category,
        payer_id=payer_id,
        split_type=split_type,
        frequency=frequency,
        anchor_day=first_due_on.day,
        next_due_on=first_due_on,
        reminder_days_before=reminder_days_before,
        created_by=creator.id,
        participants=_validated_participants(db, group, participants or []),
    )
    RecurringBillRepository(db).add(bill)
    db.commit()
    db.refresh(bill)
    return bill


def update_bill(
    db: Session,
    group: Group,
    bill: RecurringBill,
    *,
    title: str | None = None,
    amount: Decimal | None = None,
    clear_amount: bool = False,
    category: ExpenseCategory | None = None,
    payer_id: uuid.UUID | None = None,
    split_type: SplitType | None = None,
    participants: list[ParticipantSpec] | None = None,
    active: bool | None = None,
    reminder_days_before: int | None = None,
    next_due_on: date | None = None,
) -> RecurringBill:
    if title is not None:
        bill.title = title.strip()
    if category is not None:
        bill.category = category
    if split_type is not None:
        bill.split_type = split_type
    if active is not None:
        bill.active = active

    if clear_amount:
        # Turning a fixed bill back into a reminder-only one.
        bill.amount = None
    elif amount is not None:
        if amount <= 0:
            raise BadRequestError("A bill amount must be greater than zero")
        bill.amount = amount

    if payer_id is not None:
        if GroupRepository(db).get_membership(group.id, payer_id) is None:
            raise BadRequestError("The payer must be a member of this group")
        bill.payer_id = payer_id

    if reminder_days_before is not None:
        if reminder_days_before < 0:
            raise BadRequestError("Reminder days cannot be negative")
        bill.reminder_days_before = reminder_days_before

    if next_due_on is not None:
        bill.next_due_on = next_due_on
        # Moving the date re-anchors the bill: somebody rescheduling rent to the
        # 5th means the 5th from now on, not the 5th once and then the 31st.
        bill.anchor_day = next_due_on.day
        bill.reminded_for = None

    if participants is not None:
        new_participants = _validated_participants(db, group, participants)
        bill.participants.clear()
        db.flush()
        bill.participants.extend(new_participants)

    db.commit()
    db.refresh(bill)
    return bill


def delete_bill(db: Session, bill: RecurringBill) -> None:
    """Expenses already generated are untouched -- `recurring_bill_id` is
    ON DELETE SET NULL. Money that has changed hands does not move because a
    schedule was deleted."""
    RecurringBillRepository(db).delete(bill)
    db.commit()


# --- turning a bill into an expense ------------------------------------------


def _post_one(
    db: Session,
    group: Group,
    bill: RecurringBill,
    *,
    creator: User,
    amount: Decimal,
    when: date,
) -> Expense | None:
    """Create the expense for one occurrence. Does not commit.

    Returns None if this bill has already been posted for this date. A unique
    index on `(recurring_bill_id, expense_date)` decides that, not a read
    beforehand -- two clients calling `run` at the same moment both see the same
    `next_due_on`, and only the database can settle which of them posts rent.

    The insert sits in a SAVEPOINT so losing that race costs one statement
    rather than every expense already posted in this run.
    """
    participants = [
        ParticipantSpec(user_id=p.user_id, share_value=p.share_value) for p in bill.participants
    ] or None

    try:
        with db.begin_nested():
            expense = expense_service.build_expense(
                db,
                group,
                creator=creator,
                payer_id=bill.payer_id,
                title=bill.title,
                total_amount=amount,
                expense_date=when,
                split_type=bill.split_type,
                participants=participants,
                category=bill.category,
                source=ExpenseSource.RECURRING,
                # A bill that names nobody lets a standing split rule decide --
                # which is how "rent, monthly" and "rent by room size" compose
                # into rent that posts itself and lands on the right shares.
                apply_split_rule=participants is None,
            )
            expense.recurring_bill_id = bill.id
            db.flush()
    except IntegrityError:
        return None

    bill.last_generated_on = when
    return expense


def generate_now(
    db: Session,
    group: Group,
    bill: RecurringBill,
    *,
    creator: User,
    amount: Decimal | None = None,
    expense_date: date | None = None,
) -> Expense:
    """Post this bill once, now. Used for the bills whose amount varies.

    The amount must be supplied when the bill does not carry one; inventing a
    number for the electricity would be worse than refusing.
    """
    final_amount = amount if amount is not None else bill.amount
    if final_amount is None:
        raise BadRequestError("This bill has no fixed amount. Send the amount for this month.")
    if final_amount <= 0:
        raise BadRequestError("A bill amount must be greater than zero")

    when = expense_date or bill.next_due_on
    expense = _post_one(db, group, bill, creator=creator, amount=final_amount, when=when)
    if expense is None:
        raise ConflictError(f"{bill.title} has already been recorded for {when.isoformat()}")

    bill.next_due_on = next_due(when, bill.frequency, anchor_day=bill.anchor_day)
    bill.reminded_for = None
    db.commit()
    db.refresh(expense)
    return expense


def run(db: Session, group: Group, *, today: date | None = None) -> RunResult:
    """Post everything due and remind about everything nearly due.

    Safe to call as often as you like: a bill that has already been posted for
    its due date has moved on, and a reminder already sent for a due date is not
    sent again.

    Expenses are attributed to whoever **set the bill up**, not to whoever
    happened to trigger the run. Otherwise opening the app would make you the
    author of somebody else's rent, and the cron job would have no author at
    all.
    """
    today = today or date.today()
    result = RunResult()

    horizon = date.fromordinal(today.toordinal() + REMINDER_HORIZON_DAYS)
    bills = RecurringBillRepository(db).due_in_group(group.id, on_or_before=horizon)

    recipients: list[uuid.UUID] | None = None
    for bill in bills:
        if bill.generates_automatically:
            posted = 0
            while bill.next_due_on <= today and posted < MAX_PERIODS_PER_RUN:
                expense = _post_one(
                    db,
                    group,
                    bill,
                    creator=_author_of(db, bill),
                    amount=bill.amount,  # type: ignore[arg-type]  -- checked above
                    when=bill.next_due_on,
                )
                if expense is not None:
                    result.generated.append(expense)
                bill.next_due_on = next_due(
                    bill.next_due_on, bill.frequency, anchor_day=bill.anchor_day
                )
                bill.reminded_for = None
                posted += 1
            if posted:
                continue

        if not is_reminder_due(
            bill.next_due_on, today=today, days_before=bill.reminder_days_before
        ):
            continue
        if bill.reminded_for == bill.next_due_on:
            continue

        if recipients is None:
            recipients = [m.user_id for m in GroupRepository(db).active_members(group.id)]

        notification_service.record_bill_due(
            db,
            group,
            kind=NotificationKind.BILL_DUE,
            recipients=recipients,
            bill_title=bill.title,
            due_on=bill.next_due_on.isoformat(),
            amount=bill.amount,
            needs_amount=not bill.generates_automatically,
        )
        bill.reminded_for = bill.next_due_on
        result.reminded.append(bill)
        if not bill.generates_automatically and bill.next_due_on <= today:
            result.awaiting_amount.append(bill)

    db.commit()
    return result
