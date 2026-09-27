"""Bills found in email: deciding where each goes, and a person's review.

`ingest` takes one email and ends in exactly one of three places:

* an ordinary expense in the right flat, split among its members -- only for
  a known utility sender and a flat that is certain;
* a pending bill in the mailbox owner's review list, with the reason and a
  suggested flat;
* a skipped row: not a bill, or already split from someone else's mailbox.

It owns its transaction and commits once per email, so a sync that stops
halfway keeps what it did, and a bill is never half-written.
"""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.ai import bill_parser
from app.ai.bill_parser import ParsedBill, UnreadableEmail
from app.ai.gmail import EmailMessage
from app.config import settings
from app.core.errors import BadRequestError, ConflictError, NotFoundError
from app.domain.bill_routing import FlatFacts, RouteDecision, route_bill, sender_is_trusted
from app.models.enums import (
    BillReviewReason,
    ExpenseCategory,
    ExpenseSource,
    GroupType,
    IngestedBillStatus,
    SplitType,
)
from app.models.expense import Expense
from app.models.group import Group
from app.models.ingested_bill import IngestedBill
from app.models.user import User
from app.repositories.group_repository import GroupRepository
from app.repositories.ingested_bill_repository import IngestedBillRepository
from app.repositories.recurring_bill_repository import RecurringBillRepository
from app.services import expense_service, group_service

DEFAULT_CATEGORY = ExpenseCategory.UTILITIES


def _flats(db: Session, user: User) -> list[Group]:
    """Where a household bill can go: open shared apartments the user lives in.

    Trips, couples and solo groups are left out on purpose -- an electricity
    bill never belongs to a weekend in Eilat, and counting them would mean the
    "only one group" rule almost never applied.
    """
    return [
        group
        for group in GroupRepository(db).list_for_user(user.id)
        if group.type is GroupType.SHARED_APARTMENT and group.archived_at is None
    ]


def _has_fixed_recurring(db: Session, group: Group, category: ExpenseCategory) -> bool:
    """A recurring bill of this kind that posts a fixed amount by itself.

    Splitting the emailed bill as well would charge that month twice. A
    recurring bill *without* an amount is the opposite case -- it is waiting for
    exactly this number -- and is no conflict.
    """
    return any(
        bill.active
        and not bill.is_finished
        and bill.amount is not None
        and (bill.category or DEFAULT_CATEGORY) is category
        for bill in RecurringBillRepository(db).list_by_group(group.id)
    )


def _new_row(user: User, email: EmailMessage, parsed: ParsedBill | None) -> IngestedBill:
    # Pending until decided: the row is flushed before the decision is made,
    # because the expense it may become records the row's id.
    row = IngestedBill(
        user_id=user.id, gmail_message_id=email.id, status=IngestedBillStatus.PENDING_REVIEW
    )
    if parsed is None or not parsed.is_bill:
        return row
    row.sender = email.sender[:320] or None
    row.subject = email.subject[:500] or None
    row.received_at = email.received_at
    row.provider_name = parsed.provider_name
    row.total_amount = parsed.total_amount
    row.currency = parsed.currency
    row.due_date = parsed.due_date
    row.billed_to_name = parsed.billed_to_name
    row.service_address = parsed.service_address
    row.invoice_number = parsed.invoice_number
    row.category = parsed.category
    row.ai_metadata = {
        **parsed.metadata,
        "sender": email.sender,
        "billing_period": [
            d.isoformat() if d else None
            for d in (parsed.billing_period_start, parsed.billing_period_end)
        ],
        "issue_date": parsed.issue_date.isoformat() if parsed.issue_date else None,
    }
    return row


def _expense_date(bill: IngestedBill) -> date:
    issued = (bill.ai_metadata or {}).get("issue_date")
    if issued:
        return date.fromisoformat(issued)
    if bill.received_at:
        return bill.received_at.date()
    return datetime.now(UTC).date()


def _split(db: Session, bill: IngestedBill, user: User, group: Group, amount: Decimal) -> Expense:
    """The bill as an ordinary expense. Everything else -- notifications, the
    budget check, standing split rules -- happens in `build_expense`."""
    expense = expense_service.build_expense(
        db,
        group,
        creator=user,
        payer_id=user.id,
        title=bill.provider_name or bill.subject or "Bill",
        total_amount=amount,
        expense_date=_expense_date(bill),
        # WEIGHT with nobody named: every active member at their
        # `default_split_weight`, which is an equal split when all weights are 1
        # -- unless a standing rule (rent by room size) applies, which wins.
        split_type=SplitType.WEIGHT,
        participants=None,
        category=bill.category or DEFAULT_CATEGORY,
        source=ExpenseSource.GMAIL_API,
        apply_split_rule=True,
        ai_metadata={
            **(bill.ai_metadata or {}),
            "ingested_bill_id": str(bill.id),
            "due_date": bill.due_date.isoformat() if bill.due_date else None,
        },
    )
    bill.expense_id = expense.id
    bill.group_id = group.id
    return expense


def ingest(db: Session, user: User, email: EmailMessage) -> IngestedBillStatus:
    """Read one email and put it where it belongs. Commits."""
    repo = IngestedBillRepository(db)

    try:
        extracted, notes = bill_parser.read_bill(email)
    except (UnreadableEmail, BadRequestError):
        # It matched the bill search, so it may well be a bill the model could
        # not open -- a password-protected PDF, say. The owner can still type
        # the amount in and approve it.
        row = _new_row(user, email, ParsedBill(is_bill=True))
        row.status = IngestedBillStatus.PENDING_REVIEW
        row.review_reason = BillReviewReason.UNREADABLE
        repo.add(row)
        db.commit()
        return row.status

    parsed = bill_parser.build_bill(extracted, notes)
    row = _new_row(user, email, parsed)
    if not parsed.is_bill:
        row.status = IngestedBillStatus.SKIPPED
        row.review_reason = BillReviewReason.NOT_A_BILL
        repo.add(row)
        db.commit()
        return row.status

    category = parsed.category or DEFAULT_CATEGORY
    flats = _flats(db, user)
    decision: RouteDecision = route_bill(
        amount_known=parsed.total_amount is not None,
        trusted_sender=sender_is_trusted(email.sender, settings.bill_trusted_sender_domains),
        flats=[FlatFacts(g.id, g.address, _has_fixed_recurring(db, g, category)) for g in flats],
        service_address=parsed.service_address,
        threshold=settings.bill_address_match_threshold,
        margin=settings.bill_address_match_margin,
    )
    row.address_score = decision.address_score
    target_id = decision.group_id or decision.suggested_group_id
    target = next((g for g in flats if g.id == target_id), None)
    row.group_id = target.id if target else None
    repo.add(row)

    # Already split in that flat from someone else's mailbox.
    if target and row.provider_name and row.invoice_number:
        earlier = repo.find_split_invoice(target.id, row.provider_name, row.invoice_number)
        if earlier is not None:
            row.status = IngestedBillStatus.SKIPPED
            row.review_reason = BillReviewReason.DUPLICATE
            row.expense_id = earlier.expense_id
            db.commit()
            return row.status

    reason = decision.reason
    if reason is None and target and row.currency and row.currency != target.currency:
        reason = BillReviewReason.CURRENCY_MISMATCH

    if reason is None and target is not None and row.total_amount is not None:
        _split(db, row, user, target, row.total_amount)
        row.status = IngestedBillStatus.IMPORTED
    else:
        row.status = IngestedBillStatus.PENDING_REVIEW
        row.review_reason = reason
    db.commit()
    return row.status


# --- the review list --------------------------------------------------------------


def list_bills(
    db: Session,
    user: User,
    *,
    status: IngestedBillStatus | None,
    limit: int,
    offset: int,
) -> tuple[list[IngestedBill], int]:
    repo = IngestedBillRepository(db)
    return (
        repo.list_for_user(user.id, status=status, limit=limit, offset=offset),
        repo.count_for_user(user.id, status=status),
    )


def _pending(db: Session, user: User, bill_id: uuid.UUID) -> IngestedBill:
    bill = IngestedBillRepository(db).get_for_user(user.id, bill_id)
    if bill is None:
        # Somebody else's bill is as missing as a bill that does not exist.
        raise NotFoundError("Bill not found")
    if bill.status is not IngestedBillStatus.PENDING_REVIEW:
        raise ConflictError("This bill has already been dealt with")
    return bill


def approve(
    db: Session,
    user: User,
    bill_id: uuid.UUID,
    *,
    group_id: uuid.UUID,
    total_amount: Decimal | None = None,
) -> Expense:
    """The owner says which flat. The bill becomes an expense there."""
    bill = _pending(db, user, bill_id)

    groups = GroupRepository(db)
    membership = groups.get_membership(group_id, user.id)
    if membership is None or membership.left_at is not None:
        raise NotFoundError("Group not found")
    group = membership.group
    group_service.require_open(group)

    amount = total_amount or bill.total_amount
    if amount is None:
        raise BadRequestError("Enter the amount: it could not be read from the bill")
    if total_amount is not None:
        bill.total_amount = total_amount

    expense = _split(db, bill, user, group, amount)
    bill.status = IngestedBillStatus.APPROVED
    db.commit()
    db.refresh(expense)
    return expense


def dismiss(db: Session, user: User, bill_id: uuid.UUID) -> IngestedBill:
    bill = _pending(db, user, bill_id)
    bill.status = IngestedBillStatus.DISMISSED
    db.commit()
    db.refresh(bill)
    return bill
