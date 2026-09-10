"""Expense endpoints.

Group-scoped routes authorize through `GroupMembership`. The `/expenses/{id}`
routes authorize through `ExpenseForMember`, which resolves the expense's group
and applies the same membership rule.
"""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, File, Query, Response, UploadFile, status

from app.config import settings
from app.core.deps import CurrentUser, DbSession, ExpenseForMember, GroupMembership
from app.models.enums import ExpenseCategory
from app.schemas.expense import ExpenseCreate, ExpenseOut, ExpenseUpdate
from app.schemas.page import Page
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


@group_router.get("/{group_id}/expenses", response_model=Page[ExpenseOut])
def list_expenses(
    membership: GroupMembership,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    category: ExpenseCategory | None = None,
    payer_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> Page[ExpenseOut]:
    expenses, total = expense_service.list_expenses(
        db,
        membership.group,
        limit=limit,
        offset=offset,
        category=category,
        payer_id=payer_id,
        date_from=date_from,
        date_to=date_to,
    )
    return Page[ExpenseOut](
        items=[ExpenseOut.model_validate(e) for e in expenses],
        total=total,
        limit=limit,
        offset=offset,
    )


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


# --- receipts ---------------------------------------------------------------


@router.put("/{expense_id}/receipt", response_model=ExpenseOut)
def upload_receipt(
    expense: ExpenseForMember,
    db: DbSession,
    file: Annotated[UploadFile, File(description="A JPEG, PNG or WebP photo of the receipt.")],
) -> ExpenseOut:
    """Attach a receipt photo. Uploading again replaces the previous one.

    PUT rather than POST because there is one receipt per expense: sending the
    same file twice leaves the same state, and no second receipt appears.
    """
    # One byte past the limit is all we need to know it is too big, so an
    # oversized upload never lands in memory in full. Starlette has already
    # spooled the body to a temporary file by this point, though -- capping what
    # actually reaches the server is the reverse proxy's job in production
    # (`client_max_body_size` in nginx).
    data = file.file.read(settings.receipt_max_bytes + 1)
    updated = expense_service.attach_receipt(db, expense, data=data)
    return ExpenseOut.model_validate(updated)


@router.get("/{expense_id}/receipt")
def get_receipt(expense: ExpenseForMember) -> Response:
    """Serve the receipt image to members of the group.

    Receipts show what people bought and where they were, so they go through
    this authorized route rather than a public static directory.
    """
    data, content_type = expense_service.read_receipt(expense)
    return Response(
        content=data,
        media_type=content_type,
        headers={
            # Private: a receipt is not something to leave in a shared cache.
            "Cache-Control": "private, max-age=3600",
            # These are bytes a user uploaded. A file can be a valid PNG *and*
            # valid HTML; nosniff stops a browser from deciding for itself that
            # this one is a document and running it.
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "inline",
        },
    )


@router.delete("/{expense_id}/receipt", response_model=ExpenseOut)
def delete_receipt(expense: ExpenseForMember, db: DbSession) -> ExpenseOut:
    updated = expense_service.remove_receipt(db, expense)
    return ExpenseOut.model_validate(updated)
