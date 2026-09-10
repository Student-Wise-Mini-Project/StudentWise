"""Expense endpoints.

Group-scoped routes authorize through `GroupMembership`. The `/expenses/{id}`
routes authorize through `ExpenseForMember`, which resolves the expense's group
and applies the same membership rule.
"""

import uuid
from datetime import date

from fastapi import APIRouter, Query, status

from app.core.deps import CurrentUser, DbSession, ExpenseForMember, GroupMembership
from app.schemas.expense import ExpenseCreate, ExpenseOut, ExpenseUpdate
from app.services import expense_service
from app.services.expense_service import ParticipantSpec

group_router = APIRouter(prefix="/groups", tags=["expenses"])
router = APIRouter(prefix="/expenses", tags=["expenses"])


def _specs(payload: ExpenseCreate | ExpenseUpdate) -> list[ParticipantSpec] | None:
    if payload.participants is None:
        return None
    return [
        ParticipantSpec(user_id=p.user_id, share_value=p.share_value) for p in payload.participants
    ]


@group_router.get("/{group_id}/expenses", response_model=list[ExpenseOut])
def list_expenses(
    membership: GroupMembership,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    category: str | None = None,
    payer_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[ExpenseOut]:
    expenses = expense_service.list_expenses(
        db,
        membership.group,
        limit=limit,
        offset=offset,
        category=category,
        payer_id=payer_id,
        date_from=date_from,
        date_to=date_to,
    )
    return [ExpenseOut.model_validate(e) for e in expenses]


@group_router.post(
    "/{group_id}/expenses", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED
)
def create_expense(
    payload: ExpenseCreate,
    membership: GroupMembership,
    current_user: CurrentUser,
    db: DbSession,
) -> ExpenseOut:
    expense = expense_service.create_expense(
        db,
        membership.group,
        creator=current_user,
        payer_id=payload.payer_id,
        title=payload.title,
        total_amount=payload.total_amount,
        expense_date=payload.expense_date,
        split_type=payload.split_type,
        participants=_specs(payload),
        category=payload.category,
        notes=payload.notes,
        source=payload.source,
    )
    return ExpenseOut.model_validate(expense)


@router.get("/{expense_id}", response_model=ExpenseOut)
def get_expense(expense: ExpenseForMember) -> ExpenseOut:
    return ExpenseOut.model_validate(expense)


@router.patch("/{expense_id}", response_model=ExpenseOut)
def update_expense(
    payload: ExpenseUpdate,
    expense: ExpenseForMember,
    db: DbSession,
) -> ExpenseOut:
    updated = expense_service.update_expense(
        db,
        expense,
        expense.group,
        title=payload.title,
        total_amount=payload.total_amount,
        expense_date=payload.expense_date,
        category=payload.category,
        notes=payload.notes,
        payer_id=payload.payer_id,
        split_type=payload.split_type,
        participants=_specs(payload),
        recompute_splits=payload.participants is not None,
    )
    return ExpenseOut.model_validate(updated)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(expense: ExpenseForMember, db: DbSession) -> None:
    expense_service.delete_expense(db, expense)
