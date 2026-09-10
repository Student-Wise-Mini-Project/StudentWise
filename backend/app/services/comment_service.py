"""Comment business rules. Owns the transaction.

Comments are where the argument about a bill happens ("this was only me and
Dana"), so they live next to the expense and are visible to the whole group --
there are no private comments.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.errors import BadRequestError, ForbiddenError, NotFoundError
from app.models.comment import ExpenseComment
from app.models.enums import MemberRole
from app.models.expense import Expense
from app.models.group import Group, GroupMember
from app.models.user import User
from app.repositories.comment_repository import CommentRepository
from app.services import notification_service

MAX_BODY_LENGTH = 2000


def _clean(body: str) -> str:
    cleaned = body.strip()
    if not cleaned:
        raise BadRequestError("A comment needs some text")
    if len(cleaned) > MAX_BODY_LENGTH:
        raise BadRequestError(f"A comment can be at most {MAX_BODY_LENGTH} characters")
    return cleaned


def get_comment(db: Session, comment_id: uuid.UUID) -> ExpenseComment:
    comment = CommentRepository(db).get(comment_id)
    if comment is None:
        raise NotFoundError("Comment not found")
    return comment


def list_comments(
    db: Session, expense: Expense, *, limit: int = 50, offset: int = 0
) -> tuple[list[ExpenseComment], int]:
    repo = CommentRepository(db)
    items = repo.list_by_expense(expense.id, limit=limit, offset=offset)
    return items, repo.count_by_expense(expense.id)


def create_comment(
    db: Session,
    expense: Expense,
    group: Group,
    *,
    author: User,
    body: str,
) -> ExpenseComment:
    cleaned = _clean(body)
    comment = ExpenseComment(expense_id=expense.id, user_id=author.id, body=cleaned)
    CommentRepository(db).add(comment)

    # Inside this transaction on purpose: a comment that notified nobody, or a
    # notification about a comment that was never saved, are both wrong.
    notification_service.record_comment_added(db, expense, group, actor=author, body=cleaned)

    db.commit()
    db.refresh(comment)
    return comment


def update_comment(
    db: Session, comment: ExpenseComment, *, author: User, body: str
) -> ExpenseComment:
    """Only the author may edit, and editing is stamped.

    An unmarked edit lets someone rewrite what they agreed to after the fact,
    which is precisely the argument this feature exists to settle.
    """
    if comment.user_id != author.id:
        raise ForbiddenError("You can only edit your own comments")

    cleaned = _clean(body)
    if cleaned != comment.body:
        comment.body = cleaned
        comment.edited_at = datetime.now(UTC)

    db.commit()
    db.refresh(comment)
    return comment


def delete_comment(db: Session, comment: ExpenseComment, *, membership: GroupMember) -> None:
    """The author can delete their own comment; a group owner can delete any of
    them, because someone has to be able to remove abuse."""
    is_author = comment.user_id == membership.user_id
    is_owner = membership.role is MemberRole.OWNER
    if not (is_author or is_owner):
        raise ForbiddenError("You can only delete your own comments")

    CommentRepository(db).delete(comment)
    db.commit()
