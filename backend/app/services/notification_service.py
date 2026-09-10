"""In-app notifications.

This module has two halves, and the difference matters:

* ``record_*`` functions are called *by other services* from inside their
  transaction. They add rows and never commit -- the service that owns the
  event owns the commit, so an expense and the notifications about it land
  together or not at all.
* Everything else is called from the API directly and does own its transaction.

Wording is not stored. Each row keeps `kind` plus a `payload` of plain facts,
and `render` turns that into a title and body at read time -- so the app can be
translated without touching a single existing row.
"""

import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.errors import BadRequestError, NotFoundError
from app.models.enums import NotificationKind
from app.models.expense import Expense
from app.models.group import Group
from app.models.notification import Notification
from app.models.settlement import Settlement
from app.models.user import User
from app.repositories.comment_repository import CommentRepository
from app.repositories.expense_repository import ExpenseRepository
from app.repositories.notification_repository import NotificationRepository

#: How much of a comment goes into the notification before it is cut short.
EXCERPT_LENGTH = 140

LEFT_QUOTE = "“"
RIGHT_QUOTE = "”"
ELLIPSIS = "…"


@dataclass(frozen=True)
class RenderedNotification:
    title: str
    body: str


def _money(amount: Decimal) -> str:
    """Money crosses into JSONB as a string, exactly as it does into JSON --
    `json.dumps` cannot serialise a Decimal, and float would lose cents."""
    return str(amount)


def _quoted(text: str) -> str:
    return f"{LEFT_QUOTE}{text}{RIGHT_QUOTE}"


def _excerpt(text: str) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) <= EXCERPT_LENGTH:
        return cleaned
    return cleaned[: EXCERPT_LENGTH - 1].rstrip() + ELLIPSIS


# --- writing (called from inside another service's transaction) -------------


def record_expense_added(
    db: Session,
    expense: Expense,
    group: Group,
    *,
    actor: User,
) -> None:
    """Tell every participant except the person who entered it."""
    owed_by_user = {split.user_id: split.owed_amount for split in expense.splits}
    recipients = [user_id for user_id in owed_by_user if user_id != actor.id]

    NotificationRepository(db).add_all(
        [
            Notification(
                user_id=user_id,
                actor_id=actor.id,
                group_id=group.id,
                kind=NotificationKind.EXPENSE_ADDED,
                expense_id=expense.id,
                payload={
                    "actor_name": actor.name,
                    "group_name": group.name,
                    "expense_title": expense.title,
                    "total_amount": _money(expense.total_amount),
                    "owed_amount": _money(owed_by_user[user_id]),
                    "currency": group.currency,
                },
            )
            for user_id in recipients
        ]
    )


def record_comment_added(
    db: Session,
    expense: Expense,
    group: Group,
    *,
    actor: User,
    body: str,
) -> None:
    """Tell the people on the expense and anyone already in the thread.

    Someone who has commented but is not a participant still gets replies --
    otherwise a flatmate who asks "what was this?" never hears the answer.
    """
    audience = set(ExpenseRepository(db).participant_ids(expense.id))
    audience.update(CommentRepository(db).commenter_ids(expense.id))
    audience.add(expense.created_by)
    audience.discard(actor.id)

    NotificationRepository(db).add_all(
        [
            Notification(
                user_id=user_id,
                actor_id=actor.id,
                group_id=group.id,
                kind=NotificationKind.COMMENT_ADDED,
                expense_id=expense.id,
                payload={
                    "actor_name": actor.name,
                    "group_name": group.name,
                    "expense_title": expense.title,
                    "excerpt": _excerpt(body),
                },
            )
            for user_id in sorted(audience, key=str)
        ]
    )


def record_settlement(
    db: Session,
    settlement: Settlement,
    group: Group,
    *,
    actor: User,
) -> None:
    """Tell the two people involved -- minus whoever recorded it."""
    recipients = {settlement.from_user_id, settlement.to_user_id} - {actor.id}

    NotificationRepository(db).add_all(
        [
            Notification(
                user_id=user_id,
                actor_id=actor.id,
                group_id=group.id,
                kind=NotificationKind.SETTLEMENT_RECORDED,
                settlement_id=settlement.id,
                payload={
                    "actor_name": actor.name,
                    "group_name": group.name,
                    "amount": _money(settlement.amount),
                    "currency": group.currency,
                    # From the recipient's point of view, not the actor's.
                    "direction": "received" if user_id == settlement.to_user_id else "sent",
                },
            )
            for user_id in sorted(recipients, key=str)
        ]
    )


def _reminder(*, user_id: uuid.UUID, actor: User, group: Group, amount: Decimal) -> Notification:
    return Notification(
        user_id=user_id,
        actor_id=actor.id,
        group_id=group.id,
        kind=NotificationKind.PAYMENT_REMINDER,
        payload={
            "actor_name": actor.name,
            "group_name": group.name,
            "amount": _money(amount),
            "currency": group.currency,
        },
    )


# --- reading and acting on notifications (owns its transaction) -------------


def list_notifications(
    db: Session,
    user: User,
    *,
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Notification], int]:
    repo = NotificationRepository(db)
    items = repo.list_for_user(user.id, unread_only=unread_only, limit=limit, offset=offset)
    total = repo.count_for_user(user.id, unread_only=unread_only)
    return items, total


def unread_count(db: Session, user: User) -> int:
    return NotificationRepository(db).count_for_user(user.id, unread_only=True)


def mark_read(db: Session, user: User, notification_id: uuid.UUID) -> Notification:
    notification = NotificationRepository(db).get(notification_id)
    # Not 403 for someone else's notification: saying "forbidden" would confirm
    # that this id exists, and it is none of their business either way.
    if notification is None or notification.user_id != user.id:
        raise NotFoundError("Notification not found")

    if notification.read_at is None:
        notification.read_at = datetime.now(UTC)
    db.commit()
    db.refresh(notification)
    return notification


def mark_all_read(db: Session, user: User) -> int:
    marked = NotificationRepository(db).mark_all_read(user.id)
    db.commit()
    return marked


def send_reminders(
    db: Session,
    group: Group,
    *,
    actor: User,
    debtor_ids: Iterable[uuid.UUID] | None = None,
) -> list[Notification]:
    """Nudge the people who owe the caller money in this group.

    Deliberately narrow: you can only remind people who owe *you*, and only for
    what they actually owe. A reminder anyone could send to anyone for any
    amount is a harassment feature, not a payments feature. The amounts come
    from the settlement plan, so a reminder always matches what the balances
    screen shows.
    """
    # Imported here rather than at module scope to keep the import graph acyclic:
    # balance_service is free to gain a notification of its own later.
    from app.services import balance_service

    plan = balance_service.compute_settlement_plan(db, group)
    owed_to_actor = {t.from_user.id: t.amount for t in plan if t.to_user.id == actor.id}

    if debtor_ids is not None:
        requested = set(debtor_ids)
        if requested - set(owed_to_actor):
            raise BadRequestError("Those people do not owe you anything in this group")
        owed_to_actor = {uid: amount for uid, amount in owed_to_actor.items() if uid in requested}

    if not owed_to_actor:
        raise BadRequestError("Nobody owes you anything in this group")

    notifications = [
        _reminder(user_id=user_id, actor=actor, group=group, amount=amount)
        for user_id, amount in sorted(owed_to_actor.items(), key=lambda item: str(item[0]))
    ]
    NotificationRepository(db).add_all(notifications)
    db.commit()
    return notifications


# --- rendering --------------------------------------------------------------


def render(notification: Notification) -> RenderedNotification:
    """Turn a stored notification into words.

    English only for now. A Hebrew version is another branch in this function
    and needs no migration, which is exactly why the wording is not in the
    database.
    """
    payload = notification.payload or {}
    actor = payload.get("actor_name", "Someone")
    group = payload.get("group_name", "your group")
    currency = payload.get("currency", "")

    match notification.kind:
        case NotificationKind.EXPENSE_ADDED:
            title = f"{actor} added {_quoted(payload.get('expense_title', 'an expense'))}"
            body = (
                f"Your share is {payload.get('owed_amount', '?')} {currency} "
                f"of {payload.get('total_amount', '?')} {currency} in {group}."
            )
        case NotificationKind.COMMENT_ADDED:
            title = f"{actor} commented on {_quoted(payload.get('expense_title', 'an expense'))}"
            body = payload.get("excerpt", "")
        case NotificationKind.SETTLEMENT_RECORDED:
            received = payload.get("direction") == "received"
            title = (
                f"{actor} recorded a payment to you"
                if received
                else f"{actor} recorded your payment"
            )
            body = f"{payload.get('amount', '?')} {currency} in {group}."
        case NotificationKind.PAYMENT_REMINDER:
            title = f"{actor} is waiting to be paid back"
            body = f"You owe {payload.get('amount', '?')} {currency} in {group}."
        case NotificationKind.BILL_DUE:
            bill = payload.get("bill_title", "A bill")
            when = payload.get("due_on", "soon")
            if payload.get("needs_amount"):
                title = f"{bill} is due -- somebody needs to enter the amount"
                body = f"Due {when} in {group}. The amount varies, so nothing was posted."
            else:
                title = f"{bill} is due"
                body = f"{payload.get('amount', '?')} {currency} on {when} in {group}."
        case NotificationKind.BUDGET_WARNING | NotificationKind.BUDGET_EXCEEDED:
            scope = payload.get("category") or "overall"
            over = notification.kind is NotificationKind.BUDGET_EXCEEDED
            title = (
                f"{group} is over its {scope} budget"
                if over
                else f"{group} is close to its {scope} budget"
            )
            body = (
                f"{payload.get('spent', '?')} {currency} of "
                f"{payload.get('limit', '?')} {currency} "
                f"({payload.get('share_used', '?')}%) in {payload.get('month', 'this month')}."
            )
        case _:
            # Unreachable while every kind above is handled, and a loud failure
            # if a new kind is ever added without a branch here.
            raise BadRequestError(f"Cannot render notification kind {notification.kind}")

    return RenderedNotification(title=title.strip(), body=" ".join(body.split()))


def record_budget_alert(
    db: Session,
    group: Group,
    *,
    kind: NotificationKind,
    recipients: Iterable[uuid.UUID],
    category: str | None,
    spent: Decimal,
    limit: Decimal,
    share_used: Decimal,
    month: str,
) -> None:
    """Tell the group a budget is close to, or past, its limit.

    Everyone hears about this one, including whoever entered the expense that
    tripped it -- a budget is the group's, not one person's, and the person who
    just spent the money is the one best placed to do something about it.
    """
    NotificationRepository(db).add_all(
        [
            Notification(
                user_id=user_id,
                actor_id=None,  # nobody did this; an arithmetic threshold did
                group_id=group.id,
                kind=kind,
                payload={
                    "group_name": group.name,
                    "category": category,
                    "spent": _money(spent),
                    "limit": _money(limit),
                    "share_used": str(share_used),
                    "currency": group.currency,
                    "month": month,
                },
            )
            for user_id in sorted(recipients, key=str)
        ]
    )


def record_bill_due(
    db: Session,
    group: Group,
    *,
    kind: NotificationKind,
    recipients: Iterable[uuid.UUID],
    bill_title: str,
    due_on: str,
    amount: Decimal | None,
    needs_amount: bool,
) -> None:
    """Tell the group a recurring bill is due, or nearly.

    `needs_amount` is the whole point of the distinction: a bill with a fixed
    amount posts itself and this is a courtesy, while a bill whose amount varies
    is waiting for somebody to read the meter.
    """
    NotificationRepository(db).add_all(
        [
            Notification(
                user_id=user_id,
                actor_id=None,  # a calendar did this, not a person
                group_id=group.id,
                kind=kind,
                payload={
                    "group_name": group.name,
                    "bill_title": bill_title,
                    "due_on": due_on,
                    "amount": _money(amount) if amount is not None else None,
                    "needs_amount": needs_amount,
                    "currency": group.currency,
                },
            )
            for user_id in sorted(recipients, key=str)
        ]
    )
