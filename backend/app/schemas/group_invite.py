"""Invite-link request/response schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.enums import GroupType


class InviteShareIn(BaseModel):
    #: True retires the current link and makes a new one.
    renew: bool = False


class InviteOut(BaseModel):
    """The link is `<app origin>/join/<token>`; the client builds it, so the same
    response works on the live site and on a laptop."""

    group_id: uuid.UUID
    token: str
    expires_at: datetime


class InvitePreviewOut(BaseModel):
    """What someone opening a link sees before joining. Deliberately thin: no
    members, no balances, no expenses."""

    group_id: uuid.UUID
    group_name: str
    group_type: GroupType
    invited_by: str
    expires_at: datetime
    already_member: bool
    #: A closed group takes no new members; the screen says so instead of
    #: offering a Join button that would fail.
    is_open: bool


class InviteAcceptedOut(BaseModel):
    group_id: uuid.UUID
