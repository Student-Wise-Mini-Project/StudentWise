"""Notification endpoints, plus the one that sends payment reminders."""

import uuid

from fastapi import APIRouter, Query, status

from app.core.deps import CurrentUser, DbSession, GroupMembership
from app.models.notification import Notification
from app.schemas.notification import (
    MarkAllReadOut,
    NotificationOut,
    ReminderRequest,
    UnreadCountOut,
)
from app.schemas.page import Page
from app.schemas.user import UserOut
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])
group_router = APIRouter(prefix="/groups", tags=["notifications"])


def _out(notification: Notification) -> NotificationOut:
    rendered = notification_service.render(notification)
    return NotificationOut(
        id=notification.id,
        kind=notification.kind,
        title=rendered.title,
        body=rendered.body,
        group_id=notification.group_id,
        actor=UserOut.model_validate(notification.actor) if notification.actor else None,
        expense_id=notification.expense_id,
        settlement_id=notification.settlement_id,
        payload=notification.payload or {},
        read_at=notification.read_at,
        created_at=notification.created_at,
    )


@router.get("", response_model=Page[NotificationOut])
def list_notifications(
    current_user: CurrentUser,
    db: DbSession,
    unread_only: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> Page[NotificationOut]:
    items, total = notification_service.list_notifications(
        db, current_user, unread_only=unread_only, limit=limit, offset=offset
    )
    return Page[NotificationOut](
        items=[_out(n) for n in items], total=total, limit=limit, offset=offset
    )


@router.get("/unread-count", response_model=UnreadCountOut)
def unread_count(current_user: CurrentUser, db: DbSession) -> UnreadCountOut:
    """Drives the badge. Deliberately its own cheap endpoint, so a screen that
    only needs the number does not fetch a page of notifications to count it."""
    return UnreadCountOut(unread=notification_service.unread_count(db, current_user))


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: uuid.UUID, current_user: CurrentUser, db: DbSession
) -> NotificationOut:
    notification = notification_service.mark_read(db, current_user, notification_id)
    return _out(notification)


@router.post("/read-all", response_model=MarkAllReadOut)
def mark_all_read(current_user: CurrentUser, db: DbSession) -> MarkAllReadOut:
    return MarkAllReadOut(marked_read=notification_service.mark_all_read(db, current_user))


@group_router.post(
    "/{group_id}/reminders",
    response_model=list[NotificationOut],
    status_code=status.HTTP_201_CREATED,
)
def send_reminders(
    payload: ReminderRequest,
    membership: GroupMembership,
    current_user: CurrentUser,
    db: DbSession,
) -> list[NotificationOut]:
    """Nudge the people who owe you money in this group.

    You can only remind someone who actually owes *you*, and the amount comes
    from the settlement plan rather than the request body.
    """
    notifications = notification_service.send_reminders(
        db, membership.group, actor=current_user, debtor_ids=payload.debtor_ids
    )
    return [_out(n) for n in notifications]
