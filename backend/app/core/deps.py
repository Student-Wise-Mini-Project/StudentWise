"""Shared FastAPI dependencies."""

import uuid
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import Connection
from sqlalchemy.orm import Session

from app.core.errors import ForbiddenError, NotFoundError, UnauthorizedError
from app.core.security import decode_access_token
from app.db import get_db, get_readonly_connection
from app.models.chat import ChatConversation
from app.models.comment import ExpenseComment
from app.models.expense import Expense
from app.models.group import GroupMember
from app.models.settlement import Settlement
from app.models.user import User
from app.repositories.chat_repository import ChatRepository
from app.repositories.comment_repository import CommentRepository
from app.repositories.expense_repository import ExpenseRepository
from app.repositories.group_repository import GroupRepository
from app.repositories.settlement_repository import SettlementRepository
from app.repositories.user_repository import UserRepository

# tokenUrl makes the /docs "Authorize" button log in for you.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

DbSession = Annotated[Session, Depends(get_db)]
#: For generated SQL only. Read-only transaction, always rolled back.
ReadOnlyConnection = Annotated[Connection, Depends(get_readonly_connection)]


def get_current_user(
    db: DbSession,
    token: Annotated[str, Depends(oauth2_scheme)],
) -> User:
    user = UserRepository(db).get(decode_access_token(token))
    if user is None:
        raise UnauthorizedError("User no longer exists")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_group_membership(
    group_id: uuid.UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> GroupMember:
    """Authorize access to a group. This is the whole authorization model:
    404 if the group does not exist, 403 if you are not an active member.

    Use `membership.group` to reach the group itself.
    """
    if GroupRepository(db).get(group_id) is None:
        raise NotFoundError("Group not found")

    membership = GroupRepository(db).get_membership(group_id, current_user.id)
    if membership is None or not membership.is_active:
        raise ForbiddenError("You are not a member of this group")
    return membership


GroupMembership = Annotated[GroupMember, Depends(get_group_membership)]


def get_expense_for_member(
    expense_id: uuid.UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> Expense:
    """Resolve an expense and apply the group membership rule to it."""
    expense = ExpenseRepository(db).get(expense_id)
    if expense is None:
        raise NotFoundError("Expense not found")

    membership = GroupRepository(db).get_membership(expense.group_id, current_user.id)
    if membership is None or not membership.is_active:
        raise ForbiddenError("You are not a member of this group")
    return expense


ExpenseForMember = Annotated[Expense, Depends(get_expense_for_member)]


def get_settlement_for_member(
    settlement_id: uuid.UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> Settlement:
    """Resolve a settlement and apply the group membership rule to it."""
    settlement = SettlementRepository(db).get(settlement_id)
    if settlement is None:
        raise NotFoundError("Settlement not found")

    membership = GroupRepository(db).get_membership(settlement.group_id, current_user.id)
    if membership is None or not membership.is_active:
        raise ForbiddenError("You are not a member of this group")
    return settlement


SettlementForMember = Annotated[Settlement, Depends(get_settlement_for_member)]


@dataclass(frozen=True)
class CommentContext:
    """A comment plus the two things every rule about it needs.

    `/comments/{id}` has no group in the path, so membership cannot be resolved
    by the usual dependency -- it is walked from the comment through its
    expense instead.
    """

    comment: ExpenseComment
    expense: Expense
    membership: GroupMember


def get_comment_context(
    comment_id: uuid.UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> CommentContext:
    comment = CommentRepository(db).get(comment_id)
    if comment is None:
        raise NotFoundError("Comment not found")

    expense = ExpenseRepository(db).get(comment.expense_id)
    if expense is None:
        raise NotFoundError("Comment not found")

    membership = GroupRepository(db).get_membership(expense.group_id, current_user.id)
    if membership is None or not membership.is_active:
        raise ForbiddenError("You are not a member of this group")
    return CommentContext(comment=comment, expense=expense, membership=membership)


CommentForMember = Annotated[CommentContext, Depends(get_comment_context)]


@dataclass(frozen=True)
class ConversationContext:
    conversation: ChatConversation
    membership: GroupMember


def get_conversation_context(
    conversation_id: uuid.UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> ConversationContext:
    """A conversation is private to the person who started it.

    Someone else's is a 404, not a 403: saying it exists would already tell a
    flatmate that you have been asking about the group's money. And its owner
    must still be in the group -- leaving it ends access to its data, chat
    included.
    """
    conversation = ChatRepository(db).get(conversation_id)
    if conversation is None or conversation.user_id != current_user.id:
        raise NotFoundError("Conversation not found")

    membership = GroupRepository(db).get_membership(conversation.group_id, current_user.id)
    if membership is None or not membership.is_active:
        raise ForbiddenError("You are not a member of this group")
    return ConversationContext(conversation=conversation, membership=membership)


ConversationForOwner = Annotated[ConversationContext, Depends(get_conversation_context)]
