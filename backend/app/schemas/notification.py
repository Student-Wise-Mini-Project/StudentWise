"""Notification schemas.

`title` and `body` are rendered per request, not stored -- see
`notification_service.render`. `payload` is included as well so a client that
wants to write its own wording (in Hebrew, say) never has to parse English.
"""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.enums import NotificationKind
from app.schemas.user import UserOut


class ReminderRequest(BaseModel):
    #: Omit to remind everyone who owes you in this group.
    debtor_ids: list[uuid.UUID] | None = None


class NotificationOut(BaseModel):
    id: uuid.UUID
    kind: NotificationKind
    title: str
    body: str
    group_id: uuid.UUID
    actor: UserOut | None = None
    expense_id: uuid.UUID | None = None
    settlement_id: uuid.UUID | None = None
    payload: dict[str, Any]
    read_at: datetime | None = None
    created_at: datetime


class UnreadCountOut(BaseModel):
    unread: int


class MarkAllReadOut(BaseModel):
    marked_read: int
