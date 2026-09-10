"""Settlement endpoints -- recording repayments between group members."""

from fastapi import APIRouter, Query, status

from app.core.deps import CurrentUser, DbSession, GroupMembership, SettlementForMember
from app.schemas.settlement import SettlementCreate, SettlementOut
from app.services import settlement_service

group_router = APIRouter(prefix="/groups", tags=["settlements"])
router = APIRouter(prefix="/settlements", tags=["settlements"])


@group_router.get("/{group_id}/settlements", response_model=list[SettlementOut])
def list_settlements(
    membership: GroupMembership,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[SettlementOut]:
    settlements = settlement_service.list_settlements(
        db, membership.group, limit=limit, offset=offset
    )
    return [SettlementOut.model_validate(s) for s in settlements]


@group_router.post(
    "/{group_id}/settlements", response_model=SettlementOut, status_code=status.HTTP_201_CREATED
)
def create_settlement(
    payload: SettlementCreate,
    membership: GroupMembership,
    current_user: CurrentUser,
    db: DbSession,
) -> SettlementOut:
    settlement = settlement_service.create_settlement(
        db,
        membership.group,
        creator=current_user,
        from_user_id=payload.from_user_id,
        to_user_id=payload.to_user_id,
        amount=payload.amount,
        method=payload.method,
        note=payload.note,
        settled_at=payload.settled_at,
    )
    return SettlementOut.model_validate(settlement)


@router.get("/{settlement_id}", response_model=SettlementOut)
def get_settlement(settlement: SettlementForMember) -> SettlementOut:
    return SettlementOut.model_validate(settlement)


@router.delete("/{settlement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_settlement(settlement: SettlementForMember, db: DbSession) -> None:
    """Undo a repayment that was recorded by mistake."""
    settlement_service.delete_settlement(db, settlement)
