"""Shared FastAPI dependencies."""

import uuid
from typing import Annotated

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.errors import ForbiddenError, NotFoundError, UnauthorizedError
from app.core.security import decode_access_token
from app.db import get_db
from app.models.expense import Expense
from app.models.group import GroupMember
from app.models.user import User
from app.repositories.expense_repository import ExpenseRepository
from app.repositories.group_repository import GroupRepository
from app.repositories.user_repository import UserRepository

# tokenUrl makes the /docs "Authorize" button log in for you.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

DbSession = Annotated[Session, Depends(get_db)]


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
