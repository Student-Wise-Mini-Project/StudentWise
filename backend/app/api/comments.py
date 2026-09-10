"""Comment endpoints -- the thread hanging off one expense."""

from fastapi import APIRouter, Query, status

from app.core.deps import CommentForMember, CurrentUser, DbSession, ExpenseForMember
from app.schemas.comment import CommentCreate, CommentOut, CommentUpdate
from app.schemas.page import Page
from app.services import comment_service

expense_router = APIRouter(prefix="/expenses", tags=["comments"])
router = APIRouter(prefix="/comments", tags=["comments"])


@expense_router.get("/{expense_id}/comments", response_model=Page[CommentOut])
def list_comments(
    expense: ExpenseForMember,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> Page[CommentOut]:
    comments, total = comment_service.list_comments(db, expense, limit=limit, offset=offset)
    return Page[CommentOut](
        items=[CommentOut.model_validate(c) for c in comments],
        total=total,
        limit=limit,
        offset=offset,
    )


@expense_router.post(
    "/{expense_id}/comments", response_model=CommentOut, status_code=status.HTTP_201_CREATED
)
def create_comment(
    payload: CommentCreate,
    expense: ExpenseForMember,
    current_user: CurrentUser,
    db: DbSession,
) -> CommentOut:
    comment = comment_service.create_comment(
        db, expense, expense.group, author=current_user, body=payload.body
    )
    return CommentOut.model_validate(comment)


@router.patch("/{comment_id}", response_model=CommentOut)
def update_comment(
    payload: CommentUpdate,
    context: CommentForMember,
    current_user: CurrentUser,
    db: DbSession,
) -> CommentOut:
    comment = comment_service.update_comment(
        db, context.comment, author=current_user, body=payload.body
    )
    return CommentOut.model_validate(comment)


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(context: CommentForMember, db: DbSession) -> None:
    """The author can delete their own; a group owner can delete any of them."""
    comment_service.delete_comment(db, context.comment, membership=context.membership)
