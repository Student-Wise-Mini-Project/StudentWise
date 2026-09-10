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
from app.domain.splitting import ParticipantInput, compute_splits
from app.models.enums import ExpenseSource, SplitType
from app.models.expense import Expense, ExpenseSplit
from app.models.group import Group, GroupMember
from app.models.user import User
from app.repositories.expense_repository import ExpenseRepository
from app.repositories.group_repository import GroupRepository


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
    category: str | None = None,
    payer_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[Expense]:
    return ExpenseRepository(db).list_by_group(
        group.id,
        limit=limit,
        offset=offset,
        category=category,
        payer_id=payer_id,
        date_from=date_from,
        date_to=date_to,
    )


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
    category: str | None = None,
    notes: str | None = None,
    source: ExpenseSource = ExpenseSource.MANUAL,
) -> Expense:
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
        created_by=creator.id,
        splits=splits,
    )
    ExpenseRepository(db).add(expense)
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
    category: str | None = None,
    notes: str | None = None,
    payer_id: uuid.UUID | None = None,
    split_type: SplitType | None = None,
    participants: list[ParticipantSpec] | None = None,
    recompute_splits: bool = False,
) -> Expense:
    """Apply a partial update. Splits are recomputed whenever anything that
    affects them changes, and the old rows are replaced rather than appended."""
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
    """Hard delete. The splits go with it via ON DELETE CASCADE."""
    ExpenseRepository(db).delete(expense)
    db.commit()
