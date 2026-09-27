"""Bills found in the signed-in user's email.

Only ever the caller's own: a pending bill has no flat yet, so no group
membership can authorise it. It belongs to the mailbox it came from.
"""

import uuid

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.models.enums import IngestedBillStatus
from app.schemas.expense import ExpenseOut
from app.schemas.ingested_bill import BillApprove, IngestedBillOut
from app.schemas.page import Page
from app.services import ingested_bill_service

router = APIRouter(prefix="/bills", tags=["bills"])


@router.get("", response_model=Page[IngestedBillOut])
def list_bills(
    current_user: CurrentUser,
    db: DbSession,
    status: IngestedBillStatus | None = IngestedBillStatus.PENDING_REVIEW,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> Page[IngestedBillOut]:
    """Bills waiting for review by default. `total` is the badge count."""
    bills, total = ingested_bill_service.list_bills(
        db, current_user, status=status, limit=limit, offset=offset
    )
    return Page[IngestedBillOut](
        items=[IngestedBillOut.model_validate(b) for b in bills],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/{bill_id}/approve", response_model=ExpenseOut)
def approve(
    bill_id: uuid.UUID, payload: BillApprove, current_user: CurrentUser, db: DbSession
) -> ExpenseOut:
    """Split the bill in the chosen flat, among its members, paid by the caller."""
    expense = ingested_bill_service.approve(
        db, current_user, bill_id, group_id=payload.group_id, total_amount=payload.total_amount
    )
    return ExpenseOut.model_validate(expense)


@router.post("/{bill_id}/dismiss", response_model=IngestedBillOut)
def dismiss(bill_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> IngestedBillOut:
    return IngestedBillOut.model_validate(ingested_bill_service.dismiss(db, current_user, bill_id))
