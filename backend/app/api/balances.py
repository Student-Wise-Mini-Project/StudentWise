"""Balance and settlement-plan endpoints. Both are read-only."""

from fastapi import APIRouter

from app.core.deps import DbSession, GroupMembership
from app.schemas.balance import (
    GroupBalancesOut,
    PlannedTransferOut,
    SettlementPlanOut,
    UserBalanceOut,
)
from app.schemas.user import UserOut
from app.services import balance_service

router = APIRouter(prefix="/groups", tags=["balances"])


@router.get("/{group_id}/balances", response_model=GroupBalancesOut)
def get_balances(membership: GroupMembership, db: DbSession) -> GroupBalancesOut:
    """Who is up and who is down, net of every expense and repayment."""
    group = membership.group
    balances = balance_service.compute_balances(db, group)
    return GroupBalancesOut(
        group_id=group.id,
        currency=group.currency,
        balances=[
            UserBalanceOut(
                user=UserOut.model_validate(b.user),
                paid=b.paid,
                owed=b.owed,
                settlements_sent=b.settlements_sent,
                settlements_received=b.settlements_received,
                net=b.net,
            )
            for b in balances
        ],
    )


@router.get("/{group_id}/settlement-plan", response_model=SettlementPlanOut)
def get_settlement_plan(membership: GroupMembership, db: DbSession) -> SettlementPlanOut:
    """The fewest transfers that would settle everyone up.

    Suggestions only -- nothing is written. To record that a transfer actually
    happened, POST it to /groups/{id}/settlements.
    """
    group = membership.group
    plan = balance_service.compute_settlement_plan(db, group)
    return SettlementPlanOut(
        group_id=group.id,
        currency=group.currency,
        transfers=[
            PlannedTransferOut(
                from_user=UserOut.model_validate(t.from_user),
                to_user=UserOut.model_validate(t.to_user),
                amount=t.amount,
            )
            for t in plan
        ],
    )
