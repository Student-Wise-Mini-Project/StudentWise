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


def require_open(group: Group) -> None:
    """A closed group takes no new spending.

    Called explicitly at the top of each write service rather than wired up as a
    FastAPI dependency. Two reasons. `PATCH /expenses/{id}` and its siblings
    resolve through `ExpenseForMember`, not `GroupMembership`, so no single
    dependency reaches every write. And an explicit call is greppable: the
    answer to "what does closing actually block?" is one `rg require_open` away,
    where a dependency would have to be read off a dozen route signatures.

    Deliberately *not* called by `settlement_service`. See the note there.
    """
    if not group.is_open:
        raise ConflictError("This group is closed")


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
    address: str | None = None,
) -> Group:
    if name is not None:
        group.name = name.strip()
    if currency is not None:
        group.currency = currency.upper()
    if address is not None:
        group.address = " ".join(address.split()) or None
    db.commit()
    db.refresh(group)
    return group


def delete_group(db: Session, group: Group) -> None:
    GroupRepository(db).delete(group)
    db.commit()


def close_group(db: Session, group: Group) -> Group:
    """End a trip without erasing it.

    Deliberately allowed while balances are outstanding. Real trips end with
    somebody paying in cash outside the app, and a group that cannot be closed
    until the app agrees it is square is a group nobody can ever close. The
    client warns and names what is owed; the decision stays with the person.

    What that costs is a rule elsewhere: settlements stay open on a closed
    group, or the ₪120 this group closed owing could never be paid off.
    """
    require_open(group)
    group.archived_at = datetime.now(UTC)
    db.commit()
    db.refresh(group)
    return group


def reopen_group(db: Session, group: Group) -> Group:
    if group.is_open:
        raise ConflictError("This group is not closed")
    group.archived_at = None
    db.commit()
    db.refresh(group)
    return group


def add_member(
    db: Session,
    group: Group,
    *,
    email: str | None = None,
    user_id: uuid.UUID | None = None,
    default_split_weight: Decimal = Decimal("1"),
) -> GroupMember:
    require_open(group)

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
