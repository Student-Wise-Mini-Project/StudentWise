"""Group and membership queries. Builds queries and flushes -- never commits."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import MemberRole
from app.models.group import Group, GroupMember


class GroupRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, group_id: uuid.UUID) -> Group | None:
        return self.db.get(Group, group_id)

    def list_for_user(self, user_id: uuid.UUID) -> list[Group]:
        """Groups where the user is an *active* member."""
        stmt = (
            select(Group)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .where(GroupMember.user_id == user_id, GroupMember.left_at.is_(None))
            .order_by(Group.created_at.desc())
        )
        return list(self.db.scalars(stmt).unique())

    def get_membership(self, group_id: uuid.UUID, user_id: uuid.UUID) -> GroupMember | None:
        return self.db.get(GroupMember, (group_id, user_id))

    # Join order, with the user id breaking the tie -- `joined_at` is now(), the
    # transaction's start time, so a group seeded in one transaction has none.
    # Balances and analytics are built by walking these, and a list that comes
    # back in a different order on every request is a list that cannot be read.
    _MEMBER_ORDER = (GroupMember.joined_at, GroupMember.user_id)

    def all_memberships(self, group_id: uuid.UUID) -> list[GroupMember]:
        """Every membership row, including people who have left -- leaving does
        not erase a debt, so balances still need them."""
        stmt = (
            select(GroupMember)
            .where(GroupMember.group_id == group_id)
            .order_by(*self._MEMBER_ORDER)
        )
        return list(self.db.scalars(stmt))

    def active_members(self, group_id: uuid.UUID) -> list[GroupMember]:
        stmt = (
            select(GroupMember)
            .where(GroupMember.group_id == group_id, GroupMember.left_at.is_(None))
            .order_by(*self._MEMBER_ORDER)
        )
        return list(self.db.scalars(stmt))

    def count_active_owners(self, group_id: uuid.UUID) -> int:
        stmt = select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.left_at.is_(None),
            GroupMember.role == MemberRole.OWNER,
        )
        return len(list(self.db.scalars(stmt)))

    def add(self, group: Group) -> Group:
        self.db.add(group)
        self.db.flush()
        return group

    def add_member(self, member: GroupMember) -> GroupMember:
        self.db.add(member)
        self.db.flush()
        return member

    def delete(self, group: Group) -> None:
        self.db.delete(group)
        self.db.flush()
