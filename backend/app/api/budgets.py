"""Budget endpoints -- what a group has decided not to go past."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.core.deps import CurrentUser, DbSession, GroupMembership
from app.schemas.budget import (
    BudgetCreate,
    BudgetOut,
    BudgetReportOut,
    BudgetStatusOut,
    BudgetUpdate,
)
from app.services import budget_service

router = APIRouter(prefix="/groups", tags=["budgets"])

MonthFilter = Annotated[
    str | None,
    Query(pattern=r"^\d{4}-\d{2}$", description='Which month, as "2026-09". Defaults to now.'),
]


@router.get("/{group_id}/budgets", response_model=BudgetReportOut)
def list_budgets(
    membership: GroupMembership,
    db: DbSession,
    month: MonthFilter = None,
) -> BudgetReportOut:
    """Every budget, with what has been spent against it this month.

    Spending is measured on expense **totals**, not on any one person's share: a
    budget is a ceiling on what leaves the household.

    A budget on `OTHER` also counts expenses nobody categorised, the same way the
    analytics endpoints fold them in.
    """
    group = membership.group
    year, month_number = budget_service.parse_month(month)
    statuses = budget_service.list_status(db, group, month=month)
    return BudgetReportOut(
        group_id=group.id,
        currency=group.currency,
        month=f"{year:04d}-{month_number:02d}",
        budgets=[
            BudgetStatusOut(
                budget=BudgetOut.model_validate(s.budget),
                month=s.month,
                spent=s.spent,
                remaining=s.remaining,
                share_used=s.share_used,
                level=s.level,
            )
            for s in statuses
        ],
    )


@router.post("/{group_id}/budgets", response_model=BudgetOut, status_code=status.HTTP_201_CREATED)
def create_budget(
    payload: BudgetCreate,
    membership: GroupMembership,
    current_user: CurrentUser,
    db: DbSession,
) -> BudgetOut:
    budget = budget_service.create_budget(
        db,
        membership.group,
        membership=membership,
        creator=current_user,
        category=payload.category,
        amount=payload.amount,
    )
    return BudgetOut.model_validate(budget)


@router.patch("/{group_id}/budgets/{budget_id}", response_model=BudgetOut)
def update_budget(
    budget_id: uuid.UUID,
    payload: BudgetUpdate,
    membership: GroupMembership,
    db: DbSession,
) -> BudgetOut:
    """Changing the amount clears the alert state, so a budget that was already
    blown can speak up again."""
    budget = budget_service.get_budget(db, membership.group, budget_id)
    updated = budget_service.update_budget(db, budget, membership=membership, amount=payload.amount)
    return BudgetOut.model_validate(updated)


@router.delete("/{group_id}/budgets/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget(budget_id: uuid.UUID, membership: GroupMembership, db: DbSession) -> None:
    budget = budget_service.get_budget(db, membership.group, budget_id)
    budget_service.delete_budget(db, budget, membership=membership)
