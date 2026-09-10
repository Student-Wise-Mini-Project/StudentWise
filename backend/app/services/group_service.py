"""Group and membership business rules. Owns the transaction."""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.errors import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.models.enums import GroupType, MemberRole
from app.models.group import Group, GroupMember
from app.models.user import User
from app.repositories.group_repository import GroupRepository
from app.repositories.user_repository import UserRepository


def require_owner(membership: GroupMember) -> None:
    if membership.role != MemberRole.OWNER:
        raise ForbiddenError("Only a group owner can do that")


def get_group(db: Session, group_id: uuid.UUID) -> Group:
    group = GroupRepository(db).get(group_id)
    if group is None:
        raise NotFoundError("Group not found")
    return group


def list_groups(db: Session, user: User) -> list[Group]:
    return GroupRepository(db).list_for_user(user.id)


def create_group(
    db: Session,
    *,
    owner: User,
    name: str,
    type: GroupType,
    currency: str = "ILS",
) -> Group:
    repo = GroupRepository(db)
    group = Group(name=name.strip(), type=type, currency=currency.upper(), created_by=owner.id)
    repo.add(group)
    # The creator is always the first OWNER.
    repo.add_member(GroupMember(group_id=group.id, user_id=owner.id, role=MemberRole.OWNER))
    db.commit()
    db.refresh(group)
    return group


def update_group(
    db: Session,
    group: Group,
    *,
    name: str | None = None,
    currency: str | None = None,
) -> Group:
    if name is not None:
        group.name = name.strip()
    if currency is not None:
        group.currency = currency.upper()
    db.commit()
    db.refresh(group)
    return group


def delete_group(db: Session, group: Group) -> None:
    GroupRepository(db).delete(group)
    db.commit()


def add_member(
    db: Session,
    group: Group,
    *,
    email: str | None = None,
    user_id: uuid.UUID | None = None,
    default_split_weight: Decimal = Decimal("1"),
) -> GroupMember:
    if (email is None) == (user_id is None):
        raise BadRequestError("Provide exactly one of email or user_id")

    user_repo = UserRepository(db)
    user = user_repo.get_by_email(email) if email is not None else user_repo.get(user_id)
    if user is None:
        raise NotFoundError("User not found")

    repo = GroupRepository(db)
    existing = repo.get_membership(group.id, user.id)
    if existing is not None:
        if existing.is_active:
            raise ConflictError("User is already a member of this group")
        # Someone who left is re-joining: revive the row so history stays intact.
        existing.left_at = None
        existing.default_split_weight = default_split_weight
        db.commit()
        return existing

    member = repo.add_member(
        GroupMember(
            group_id=group.id,
            user_id=user.id,
            role=MemberRole.MEMBER,
            default_split_weight=default_split_weight,
        )
    )
    db.commit()
    return member


def update_member(
    db: Session,
    group: Group,
    user_id: uuid.UUID,
    *,
    default_split_weight: Decimal,
) -> GroupMember:
    if default_split_weight <= 0:
        raise BadRequestError("default_split_weight must be greater than zero")

    member = GroupRepository(db).get_membership(group.id, user_id)
    if member is None or not member.is_active:
        raise NotFoundError("Member not found in this group")

    member.default_split_weight = default_split_weight
    db.commit()
    return member


def remove_member(
    db: Session,
    group: Group,
    user_id: uuid.UUID,
    *,
    acting_membership: GroupMember,
) -> GroupMember:
    """Mark a member as having left. The row is never deleted, so past expenses
    and balances stay intact."""
    is_self = acting_membership.user_id == user_id
    if not is_self:
        require_owner(acting_membership)

    repo = GroupRepository(db)
    member = repo.get_membership(group.id, user_id)
    if member is None or not member.is_active:
        raise NotFoundError("Member not found in this group")

    if member.role == MemberRole.OWNER and repo.count_active_owners(group.id) == 1:
        raise BadRequestError("Cannot remove the last owner of the group")

    member.left_at = datetime.now(UTC)
    db.commit()
    return member
