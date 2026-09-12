"""Expense business rules. Owns the transaction.

The invariant enforced here: an expense's splits always cover exactly its total,
and every participant is an active member of the expense's group.
"""

import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.errors import BadRequestError, NotFoundError
from app.core.storage import content_type_for, get_receipt_store
from app.domain.splitting import ParticipantInput, compute_splits
from app.models.enums import ExpenseCategory, ExpenseSource, SplitType
from app.models.expense import Expense, ExpenseSplit
from app.models.group import Group, GroupMember
from app.models.split_rule import SplitRule
from app.models.user import User
from app.repositories.expense_repository import ExpenseRepository
from app.repositories.group_repository import GroupRepository
from app.services import (
    budget_service,
    group_service,
    idempotency_service,
    notification_service,
    split_rule_service,
)


@dataclass(frozen=True)
class ParticipantSpec:
    """A participant as requested by the caller, before defaults are filled in."""

    user_id: uuid.UUID
    share_value: Decimal | None = None


def _active_members(db: Session, group: Group) -> dict[uuid.UUID, GroupMember]:
    return {m.user_id: m for m in GroupRepository(db).active_members(group.id)}


def _build_splits(
    db: Session,
    group: Group,
    *,
    payer_id: uuid.UUID,
    total_amount: Decimal,
    split_type: SplitType,
    participants: list[ParticipantSpec] | None,
) -> list[ExpenseSplit]:
    members = _active_members(db, group)

    if payer_id not in members:
        raise BadRequestError("The payer must be an active member of this group")

    # No participants given means "everyone currently in the group".
    if not participants:
        participants = [ParticipantSpec(user_id=uid) for uid in members]

    for participant in participants:
        if participant.user_id not in members:
            raise BadRequestError(
                f"User {participant.user_id} is not an active member of this group"
            )

    resolved = []
    for participant in participants:
        share_value = participant.share_value
        # WEIGHT falls back to the member's configured weight; the pure splitting
        # function never guesses, so the default is filled in here.
        if share_value is None and split_type is SplitType.WEIGHT:
            share_value = members[participant.user_id].default_split_weight
        resolved.append(ParticipantInput(user_id=participant.user_id, share_value=share_value))

    computed = compute_splits(total_amount, split_type, resolved)
    return [
        ExpenseSplit(
            user_id=split.user_id,
            owed_amount=split.owed_amount,
            # An EQUAL split has no meaningful raw input to keep.
            share_value=None if split_type is SplitType.EQUAL else split.share_value,
        )
        for split in computed
    ]


def _apply_split_rule(
    db: Session,
    group: Group,
    *,
    category: ExpenseCategory | None,
    participants: list[ParticipantSpec] | None,
    split_type: SplitType,
) -> tuple[SplitRule | None, list[ParticipantSpec] | None, SplitType]:
    """Let a standing rule decide the split, when nobody said otherwise.

    Precedence, in one line: **whoever names participants wins.** A rule only
    ever fills the gap left by not naming them, so an expense that says exactly
    who is on it is never quietly re-split by a rule somebody set last month.
    """
    if participants is not None:
        return None, participants, split_type

    rule = split_rule_service.find_applicable(db, group, category)
    if rule is None:
        return None, participants, split_type

    shares = split_rule_service.shares_for(db, group, rule)
    if not shares:
        # Everyone the rule names has left. Falling back to an equal split beats
        # refusing to record rent.
        return None, participants, split_type

    return (
        rule,
        [ParticipantSpec(user_id=s.user_id, share_value=s.weight) for s in shares],
        SplitType.WEIGHT,
    )


def get_expense(db: Session, expense_id: uuid.UUID) -> Expense:
    expense = ExpenseRepository(db).get(expense_id)
    if expense is None:
        raise NotFoundError("Expense not found")
    return expense


def list_expenses(
    db: Session,
    group: Group,
    *,
    limit: int = 50,
    offset: int = 0,
    category: ExpenseCategory | None = None,
    payer_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> tuple[list[Expense], int]:
    """One page of expenses, plus how many match the filters in total.

    The total is what lets a client draw a pager; it deliberately ignores limit
    and offset but honours every filter.
    """
    repo = ExpenseRepository(db)
    filters = {
        "category": category,
        "payer_id": payer_id,
        "date_from": date_from,
        "date_to": date_to,
    }
    items = repo.list_by_group(group.id, limit=limit, offset=offset, **filters)
    return items, repo.count_by_group(group.id, **filters)


def build_expense(
    db: Session,
    group: Group,
    *,
    creator: User,
    payer_id: uuid.UUID,
    title: str,
    total_amount: Decimal,
    expense_date: date,
    split_type: SplitType,
    participants: list[ParticipantSpec] | None = None,
    category: ExpenseCategory | None = None,
    notes: str | None = None,
    source: ExpenseSource = ExpenseSource.MANUAL,
    apply_split_rule: bool = True,
) -> Expense:
    """Everything creating an expense involves, except the commit.

    Split here so a recurring bill can post several months in one transaction,
    and so anything that creates an expense on the way to doing something else
    cannot accidentally commit half of it. `create_expense` is this plus the
    commit; nothing else should reimplement any of it.
    """
    rule: SplitRule | None = None
    if apply_split_rule:
        rule, participants, split_type = _apply_split_rule(
            db,
            group,
            category=category,
            participants=participants,
            split_type=split_type,
        )

    splits = _build_splits(
        db,
        group,
        payer_id=payer_id,
        total_amount=total_amount,
        split_type=split_type,
        participants=participants,
    )

    expense = Expense(
        group_id=group.id,
        payer_id=payer_id,
        title=title.strip(),
        total_amount=total_amount,
        category=category,
        expense_date=expense_date,
        split_type=split_type,
        source=source,
        notes=notes,
        split_rule_id=rule.id if rule is not None else None,
        created_by=creator.id,
        splits=splits,
    )
    ExpenseRepository(db).add(expense)
    # Same transaction as the expense: nobody should be told about an expense
    # that failed to save, and no expense should land silently.
    notification_service.record_expense_added(db, expense, group, actor=creator)
    # After the expense is in the session, so the pending row counts towards the
    # month's total; before the commit, so an alert and the expense that caused
    # it land together.
    budget_service.check_after_expense(db, group, expense)
    return expense


def create_expense(
    db: Session,
    group: Group,
    *,
    creator: User,
    payer_id: uuid.UUID,
    title: str,
    total_amount: Decimal,
    expense_date: date,
    split_type: SplitType,
    participants: list[ParticipantSpec] | None = None,
    category: ExpenseCategory | None = None,
    notes: str | None = None,
    source: ExpenseSource = ExpenseSource.MANUAL,
    apply_split_rule: bool = True,
    idempotency_key: str | None = None,
    request_fingerprint: str | None = None,
) -> Expense:
    # Not in `build_expense`: recurring bills call that directly, inside their
    # own transaction, and `run` has already decided a closed group has nothing
    # due. Checking here keeps one check per write rather than two.
    group_service.require_open(group)

    claim = None
    if idempotency_key and request_fingerprint:
        outcome = idempotency_service.claim(
            db,
            user=creator,
            scope=f"expenses:{group.id}",
            key=idempotency_key,
            request_fingerprint=request_fingerprint,
        )
        if isinstance(outcome, idempotency_service.Replay):
            # The first request already did this. Same answer, no second expense.
            return get_expense(db, outcome.resource_id)
        claim = outcome

    expense = build_expense(
        db,
        group,
        creator=creator,
        payer_id=payer_id,
        title=title,
        total_amount=total_amount,
        expense_date=expense_date,
        split_type=split_type,
        participants=participants,
        category=category,
        notes=notes,
        source=source,
        apply_split_rule=apply_split_rule,
    )
    if claim is not None:
        claim.resource_id = expense.id
    db.commit()
    db.refresh(expense)
    return expense


def update_expense(
    db: Session,
    expense: Expense,
    group: Group,
    *,
    title: str | None = None,
    total_amount: Decimal | None = None,
    expense_date: date | None = None,
    category: ExpenseCategory | None = None,
    notes: str | None = None,
    payer_id: uuid.UUID | None = None,
    split_type: SplitType | None = None,
    participants: list[ParticipantSpec] | None = None,
    recompute_splits: bool = False,
) -> Expense:
    """Apply a partial update. Splits are recomputed whenever anything that
    affects them changes, and the old rows are replaced rather than appended."""
    group_service.require_open(group)

    if title is not None:
        expense.title = title.strip()
    if expense_date is not None:
        expense.expense_date = expense_date
    if category is not None:
        expense.category = category
    if notes is not None:
        expense.notes = notes

    splits_changed = recompute_splits or any(
        value is not None for value in (total_amount, payer_id, split_type)
    )
    if total_amount is not None:
        expense.total_amount = total_amount
    if payer_id is not None:
        expense.payer_id = payer_id
    if split_type is not None:
        expense.split_type = split_type

    if splits_changed:
        # Keep the existing participants unless the caller names new ones. Without
        # this, editing the amount of an expense shared by two of four flatmates
        # would silently spread it across the whole group.
        if participants is None:
            participants = [
                ParticipantSpec(user_id=split.user_id, share_value=split.share_value)
                for split in expense.splits
            ]

        new_splits = _build_splits(
            db,
            group,
            payer_id=expense.payer_id,
            total_amount=expense.total_amount,
            split_type=expense.split_type,
            participants=participants,
        )

        # Delete the old rows and flush before adding the new ones. Otherwise
        # SQLAlchemy inserts the replacements first and trips the
        # (expense_id, user_id) unique index whenever a participant is unchanged.
        expense.splits.clear()
        db.flush()
        expense.splits.extend(new_splits)

    db.commit()
    db.refresh(expense)
    return expense


def delete_expense(db: Session, expense: Expense) -> None:
    """Hard delete. Splits, comments and notifications go with it via
    ON DELETE CASCADE; the receipt image has to be removed by hand, because the
    database knows nothing about the file."""
    group_service.require_open(expense.group)

    key = expense.receipt_image_url
    ExpenseRepository(db).delete(expense)
    db.commit()
    if key:
        get_receipt_store().delete(key)


# --- receipts ---------------------------------------------------------------


def attach_receipt(db: Session, expense: Expense, *, data: bytes) -> Expense:
    """Store a receipt image against an expense.

    Uploading a second one replaces the first: an expense has one receipt, and
    keeping the old file would leave a picture of someone's shopping on disk
    that nothing points at.
    """
    group_service.require_open(expense.group)

    store = get_receipt_store()
    previous = expense.receipt_image_url

    key = store.save(expense_id=expense.id, data=data)
    expense.receipt_image_url = key
    db.commit()
    db.refresh(expense)

    if previous and previous != key:
        # Different extension, so `save` wrote a new file rather than
        # overwriting the old one.
        store.delete(previous)
    return expense


def read_receipt(expense: Expense) -> tuple[bytes, str]:
    """The receipt's bytes and its content type."""
    key = expense.receipt_image_url
    if not key:
        raise NotFoundError("This expense has no receipt")
    return get_receipt_store().read(key), content_type_for(key)


def remove_receipt(db: Session, expense: Expense) -> Expense:
    group_service.require_open(expense.group)

    key = expense.receipt_image_url
    if not key:
        raise NotFoundError("This expense has no receipt")

    expense.receipt_image_url = None
    db.commit()
    db.refresh(expense)
    # After the commit: a file deleted for a row that then failed to save would
    # leave the expense pointing at nothing.
    get_receipt_store().delete(key)
    return expense
