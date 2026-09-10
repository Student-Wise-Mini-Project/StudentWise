"""Settlement endpoints -- recording repayments between group members."""

from typing import Annotated

from fastapi import APIRouter, Header, Query, status

from app.core.deps import CurrentUser, DbSession, GroupMembership, SettlementForMember
from app.schemas.page import Page
from app.schemas.settlement import SettlementCreate, SettlementOut
from app.services import idempotency_service, settlement_service

group_router = APIRouter(prefix="/groups", tags=["settlements"])
router = APIRouter(prefix="/settlements", tags=["settlements"])

#: An optional client-generated key. Send the same one when retrying a request
#: whose reply never arrived, and the retry returns the original resource
#: instead of creating a second one. A key is remembered per user and per
#: endpoint, so two people are free to pick the same one.
IdempotencyKey = Annotated[
    str | None,
    Header(
        alias="Idempotency-Key",
        max_length=200,
        description="Retry-safe key. The same key with the same body returns the first result.",
    ),
]


@group_router.get("/{group_id}/settlements", response_model=Page[SettlementOut])
def list_settlements(
    membership: GroupMembership,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> Page[SettlementOut]:
    settlements, total = settlement_service.list_settlements(
        db, membership.group, limit=limit, offset=offset
    )
    return Page[SettlementOut](
        items=[SettlementOut.model_validate(s) for s in settlements],
        total=total,
        limit=limit,
        offset=offset,
    )


@group_router.post(
    "/{group_id}/settlements", response_model=SettlementOut, status_code=status.HTTP_201_CREATED
)
def create_settlement(
    payload: SettlementCreate,
    membership: GroupMembership,
    current_user: CurrentUser,
    db: DbSession,
    idempotency_key: IdempotencyKey = None,
) -> SettlementOut:
    """Record that someone paid someone back.

    Accepts an `Idempotency-Key` header, exactly as expense creation does -- a
    repayment recorded twice is the same problem as an expense recorded twice.
    """
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
        idempotency_key=idempotency_key,
        request_fingerprint=idempotency_service.fingerprint(payload),
    )
    return SettlementOut.model_validate(settlement)


@router.get("/{settlement_id}", response_model=SettlementOut)
def get_settlement(settlement: SettlementForMember) -> SettlementOut:
    return SettlementOut.model_validate(settlement)


@router.delete("/{settlement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_settlement(settlement: SettlementForMember, db: DbSession) -> None:
    """Undo a repayment that was recorded by mistake."""
    settlement_service.delete_settlement(db, settlement)
