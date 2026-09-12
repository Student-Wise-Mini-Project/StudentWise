"""Settlement business rules. Owns the transaction."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.errors import BadRequestError, NotFoundError
from app.models.enums import SettlementMethod
from app.models.group import Group
from app.models.settlement import Settlement
from app.models.user import User
from app.repositories.group_repository import GroupRepository
from app.repositories.settlement_repository import SettlementRepository
from app.services import idempotency_service, notification_service


def _require_member(db: Session, group: Group, user_id: uuid.UUID, label: str) -> None:
    """Membership is checked without regard to left_at: someone who has left the
    group can still be owed money, and must still be able to be paid back."""
    if GroupRepository(db).get_membership(group.id, user_id) is None:
        raise BadRequestError(f"The {label} is not a member of this group")


def get_settlement(db: Session, settlement_id: uuid.UUID) -> Settlement:
    settlement = SettlementRepository(db).get(settlement_id)
    if settlement is None:
        raise NotFoundError("Settlement not found")
    return settlement


def list_settlements(
    db: Session, group: Group, *, limit: int = 50, offset: int = 0
) -> tuple[list[Settlement], int]:
    """One page of repayments, plus the total number in this group."""
    repo = SettlementRepository(db)
    items = repo.list_by_group(group.id, limit=limit, offset=offset)
    return items, repo.count_by_group(group.id)


# Deliberately no `group_service.require_open` anywhere in this module.
#
# Closing a group is allowed while money is still outstanding -- the client
# warns and names what is owed, but the decision stays with the person. That
# only works if the debt stays payable afterwards, so recording a payment is
# the one write a closed group still accepts. Please do not "fix" this.
def create_settlement(
    db: Session,
    group: Group,
    *,
    creator: User,
    from_user_id: uuid.UUID,
    to_user_id: uuid.UUID,
    amount: Decimal,
    method: SettlementMethod = SettlementMethod.MANUAL,
    note: str | None = None,
    settled_at: datetime | None = None,
    idempotency_key: str | None = None,
    request_fingerprint: str | None = None,
) -> Settlement:
    claim = None
    if idempotency_key and request_fingerprint:
        outcome = idempotency_service.claim(
            db,
            user=creator,
            scope=f"settlements:{group.id}",
            key=idempotency_key,
            request_fingerprint=request_fingerprint,
        )
        if isinstance(outcome, idempotency_service.Replay):
            return get_settlement(db, outcome.resource_id)
        claim = outcome

    if from_user_id == to_user_id:
        raise BadRequestError("A settlement needs two different people")
    if amount <= 0:
        raise BadRequestError("Settlement amount must be greater than zero")

    _require_member(db, group, from_user_id, "payer")
    _require_member(db, group, to_user_id, "recipient")

    settlement = Settlement(
        group_id=group.id,
        from_user_id=from_user_id,
        to_user_id=to_user_id,
        amount=amount,
        method=method,
        note=note,
        created_by=creator.id,
    )
    if settled_at is not None:
        settlement.settled_at = settled_at

    SettlementRepository(db).add(settlement)
    notification_service.record_settlement(db, settlement, group, actor=creator)
    if claim is not None:
        claim.resource_id = settlement.id
    db.commit()
    db.refresh(settlement)
    return settlement


def delete_settlement(db: Session, settlement: Settlement) -> None:
    SettlementRepository(db).delete(settlement)
    db.commit()
