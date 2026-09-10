"""Activity-feed endpoints -- what a home screen is built from."""

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession, GroupMembership
from app.schemas.activity import ActivityOut
from app.schemas.expense import ExpenseOut
from app.schemas.page import Page
from app.schemas.settlement import SettlementOut
from app.services import activity_service
from app.services.activity_service import ActivityItem

router = APIRouter(tags=["activity"])


def _out(item: ActivityItem) -> ActivityOut:
    return ActivityOut(
        kind=item.kind,
        occurred_at=item.occurred_at,
        group_id=item.group.id,
        group_name=item.group.name,
        currency=item.group.currency,
        expense=ExpenseOut.model_validate(item.expense) if item.expense is not None else None,
        settlement=(
            SettlementOut.model_validate(item.settlement) if item.settlement is not None else None
        ),
    )


@router.get("/activity", response_model=Page[ActivityOut])
def my_activity(
    current_user: CurrentUser,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> Page[ActivityOut]:
    """Everything across every group you are currently in, newest first."""
    items, total = activity_service.feed_for_user(db, current_user, limit=limit, offset=offset)
    return Page[ActivityOut](
        items=[_out(i) for i in items], total=total, limit=limit, offset=offset
    )


@router.get("/groups/{group_id}/activity", response_model=Page[ActivityOut])
def group_activity(
    membership: GroupMembership,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> Page[ActivityOut]:
    items, total = activity_service.feed_for_group(db, membership.group, limit=limit, offset=offset)
    return Page[ActivityOut](
        items=[_out(i) for i in items], total=total, limit=limit, offset=offset
    )
