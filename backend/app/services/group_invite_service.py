"""Invite links: share a link, and whoever opens it joins. Owns the transaction.

Any active member may share one -- the same people who can already add someone
by email. A group has one working link at a time: sharing again gives the same
link until it expires (14 days) or a member asks for a new one, which retires
the old one at once.

An unknown, expired and replaced link all look the same to whoever holds it:
"no longer valid". Telling them apart would only help someone guessing.
"""

import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.models.group import Group, GroupMember
from app.models.group_invite import GroupInvite
from app.models.user import User
from app.repositories.group_invite_repository import GroupInviteRepository
from app.repositories.group_repository import GroupRepository
from app.services import group_service

LIFETIME = timedelta(days=14)
#: 24 random bytes: 32 URL-safe characters, unguessable.
TOKEN_BYTES = 24


@dataclass(frozen=True)
class InvitePreview:
    invite: GroupInvite
    group: Group
    already_member: bool


def _now() -> datetime:
    return datetime.now(UTC)


def _usable(db: Session, token: str) -> GroupInvite:
    invite = GroupInviteRepository(db).by_token(token)
    if invite is None or not invite.is_usable(_now()):
        raise NotFoundError("This invite link is no longer valid. Ask for a new one.")
    return invite


def share(db: Session, group: Group, *, member: User, renew: bool = False) -> GroupInvite:
    """The group's link, making one if there is none (or a new one, if asked)."""
    group_service.require_open(group)
    repo = GroupInviteRepository(db)
    now = _now()

    if renew:
        repo.revoke_all(group.id, now)
    else:
        current = repo.current(group.id, now)
        if current is not None:
            return current

    invite = repo.add(
        GroupInvite(
            group_id=group.id,
            token=secrets.token_urlsafe(TOKEN_BYTES),
            created_by=member.id,
            expires_at=now + LIFETIME,
        )
    )
    db.commit()
    db.refresh(invite)
    return invite


def stop_sharing(db: Session, group: Group) -> None:
    GroupInviteRepository(db).revoke_all(group.id, _now())
    db.commit()


def preview(db: Session, token: str, *, user: User) -> InvitePreview:
    """What the person opening a link may see before joining: the group's name
    and who invited them. Never its members or its money."""
    invite = _usable(db, token)
    group = group_service.get_group(db, invite.group_id)
    membership = GroupRepository(db).get_membership(group.id, user.id)
    return InvitePreview(
        invite=invite,
        group=group,
        already_member=membership is not None and membership.is_active,
    )


def accept(db: Session, token: str, *, user: User) -> GroupMember:
    """Join the group the link is for. Opening it twice is harmless."""
    invite = _usable(db, token)
    group = group_service.get_group(db, invite.group_id)

    membership = GroupRepository(db).get_membership(group.id, user.id)
    if membership is not None and membership.is_active:
        return membership
    # add_member refuses a closed group, revives someone who had left, and commits.
    member = group_service.add_member(db, group, user_id=user.id)
    # The group was loaded with its old member list; anything that reads it in
    # this session next must see the new member.
    db.refresh(group)
    return member
