"""The activity feed: everything that happened, newest first, across groups.

This is what a home screen is made of. Without it the app opens on a list of
groups and the user has to go looking for what changed.

Two tables are merged in Python rather than with a SQL UNION. The shapes differ
enough that a union would have to flatten both into a lowest common denominator
and then re-fetch the rows anyway, and the cost is bounded: each side fetches
exactly `offset + limit` rows, so a page costs the same whether the group has a
hundred expenses or ten thousand. If deep paging ever becomes real, the fix is a
keyset cursor on `created_at`, not a union.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.expense import Expense
from app.models.group import Group
from app.models.settlement import Settlement
from app.models.user import User
from app.repositories.activity_repository import ActivityRepository
from app.repositories.group_repository import GroupRepository

#: Hard ceiling on a page, so `offset + limit` can never fetch the whole table.
MAX_LIMIT = 100


@dataclass(frozen=True)
class ActivityItem:
    """One thing that happened. Exactly one of `expense` / `settlement` is set."""

    occurred_at: datetime
    group: Group
    expense: Expense | None = None
    settlement: Settlement | None = None

    @property
    def kind(self) -> str:
        return "EXPENSE_ADDED" if self.expense is not None else "SETTLEMENT_RECORDED"


def _merge(
    expenses: list[Expense],
    settlements: list[Settlement],
    groups: dict[uuid.UUID, Group],
) -> list[ActivityItem]:
    items = [
        ActivityItem(occurred_at=e.created_at, group=groups[e.group_id], expense=e)
        for e in expenses
        if e.group_id in groups
    ]
    items += [
        ActivityItem(occurred_at=s.created_at, group=groups[s.group_id], settlement=s)
        for s in settlements
        if s.group_id in groups
    ]
    # Ties broken by kind then id so the order is stable across requests --
    # otherwise a pager can show the same row twice or skip one.
    items.sort(key=lambda i: (i.occurred_at, i.kind, str(_item_id(i))), reverse=True)
    return items


def _item_id(item: ActivityItem) -> uuid.UUID:
    return item.expense.id if item.expense is not None else item.settlement.id  # type: ignore[union-attr]


def _page(
    db: Session,
    groups: dict[uuid.UUID, Group],
    *,
    limit: int,
    offset: int,
) -> tuple[list[ActivityItem], int]:
    limit = min(limit, MAX_LIMIT)
    repo = ActivityRepository(db)
    group_ids = list(groups)

    # Each table could supply the whole page on its own, so both are asked for
    # enough rows to cover it.
    reach = offset + limit
    merged = _merge(
        repo.recent_expenses(group_ids, limit=reach),
        repo.recent_settlements(group_ids, limit=reach),
        groups,
    )
    return merged[offset : offset + limit], repo.count(group_ids)


def feed_for_user(
    db: Session, user: User, *, limit: int = 50, offset: int = 0
) -> tuple[list[ActivityItem], int]:
    """Everything across every group the user is currently an active member of.

    Leaving a group takes its history out of your feed; the expenses themselves
    are untouched and still count towards the group's balances.
    """
    groups = {g.id: g for g in GroupRepository(db).list_for_user(user.id)}
    return _page(db, groups, limit=limit, offset=offset)


def feed_for_group(
    db: Session, group: Group, *, limit: int = 50, offset: int = 0
) -> tuple[list[ActivityItem], int]:
    return _page(db, {group.id: group}, limit=limit, offset=offset)
