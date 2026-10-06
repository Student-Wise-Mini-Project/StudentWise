"""Invite links: share a link to a group, and join a group from one."""

from fastapi import APIRouter, status

from app.core.deps import CurrentUser, DbSession, GroupMembership
from app.schemas.group_invite import (
    InviteAcceptedOut,
    InviteOut,
    InvitePreviewOut,
    InviteShareIn,
)
from app.services import group_invite_service

group_router = APIRouter(prefix="/groups", tags=["invites"])
router = APIRouter(prefix="/invites", tags=["invites"])


def _out(invite) -> InviteOut:
    return InviteOut(group_id=invite.group_id, token=invite.token, expires_at=invite.expires_at)


@group_router.post("/{group_id}/invites", response_model=InviteOut)
def share_invite(
    payload: InviteShareIn,
    membership: GroupMembership,
    current_user: CurrentUser,
    db: DbSession,
) -> InviteOut:
    """The group's invite link, for any member to share. The same link comes back
    until it expires (14 days); `renew` retires it and makes a new one. **409**
    when the group is closed."""
    invite = group_invite_service.share(
        db, membership.group, member=current_user, renew=payload.renew
    )
    return _out(invite)


@group_router.delete("/{group_id}/invites", status_code=status.HTTP_204_NO_CONTENT)
def stop_sharing(membership: GroupMembership, db: DbSession) -> None:
    """Retire the group's link: anyone holding it can no longer join."""
    group_invite_service.stop_sharing(db, membership.group)


@router.get("/{token}", response_model=InvitePreviewOut)
def preview_invite(token: str, current_user: CurrentUser, db: DbSession) -> InvitePreviewOut:
    """What the link is for: the group's name and who invited you. Signing in is
    required; members and money are never shown before joining. **404** for a
    link that is unknown, expired or replaced -- the same answer for each."""
    found = group_invite_service.preview(db, token, user=current_user)
    return InvitePreviewOut(
        group_id=found.group.id,
        group_name=found.group.name,
        group_type=found.group.type,
        invited_by=found.invite.inviter.name,
        expires_at=found.invite.expires_at,
        already_member=found.already_member,
        is_open=found.group.is_open,
    )


@router.post("/{token}/accept", response_model=InviteAcceptedOut)
def accept_invite(token: str, current_user: CurrentUser, db: DbSession) -> InviteAcceptedOut:
    """Join the group. Accepting twice is harmless; someone who had left rejoins
    with their history intact. **409** when the group is closed."""
    membership = group_invite_service.accept(db, token, user=current_user)
    return InviteAcceptedOut(group_id=membership.group_id)
