"""Analytics endpoints. All read-only.

Pass `user_id` to switch from "what the group spent" to "what this person
consumed" -- their share of each expense, not what they paid out.
"""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import DbSession, GroupMembership, ReadOnlyConnection
from app.domain.anomalies import AnomalyDirection
from app.schemas.analytics import (
    AnomalyOut,
    AnomalyReportOut,
    CategoryBreakdownOut,
    CategorySliceOut,
    ExpenseBrief,
    MemberBreakdownOut,
    MemberSliceOut,
    MonthlyTrendOut,
    MonthPointOut,
    SummaryOut,
)
from app.schemas.nl_query import AskRequest, AskResponse
from app.schemas.user import UserOut
from app.services import analytics_service, anomaly_service, nl_query_service

router = APIRouter(prefix="/groups", tags=["analytics"])

# Annotated form keeps FastAPI happy without putting a call in a default.
UserFilter = Annotated[
    uuid.UUID | None,
    Query(description="Scope to one member's own share instead of the whole group"),
]
DateFilter = Annotated[date | None, Query(description="Inclusive bound on expense_date")]


@router.get("/{group_id}/analytics/summary", response_model=SummaryOut)
def get_summary(
    membership: GroupMembership,
    db: DbSession,
    user_id: UserFilter = None,
    date_from: DateFilter = None,
    date_to: DateFilter = None,
) -> SummaryOut:
    group = membership.group
    result = analytics_service.summary(
        db, group, user_id=user_id, date_from=date_from, date_to=date_to
    )
    largest = result.largest_expense
    return SummaryOut(
        group_id=group.id,
        currency=group.currency,
        scope="group" if user_id is None else "user",
        total_spent=result.total_spent,
        expense_count=result.expense_count,
        average_expense=result.average_expense,
        largest_expense=ExpenseBrief.model_validate(largest, from_attributes=True)
        if largest
        else None,
        first_expense_date=result.first_expense_date,
        last_expense_date=result.last_expense_date,
    )


@router.get("/{group_id}/analytics/by-category", response_model=CategoryBreakdownOut)
def get_by_category(
    membership: GroupMembership,
    db: DbSession,
    user_id: UserFilter = None,
    date_from: DateFilter = None,
    date_to: DateFilter = None,
) -> CategoryBreakdownOut:
    group = membership.group
    slices = analytics_service.by_category(
        db, group, user_id=user_id, date_from=date_from, date_to=date_to
    )
    return CategoryBreakdownOut(
        group_id=group.id,
        currency=group.currency,
        scope="group" if user_id is None else "user",
        total=sum((s.total for s in slices), analytics_service.ZERO),
        categories=[CategorySliceOut(**vars(s)) for s in slices],
    )


@router.get("/{group_id}/analytics/by-month", response_model=MonthlyTrendOut)
def get_by_month(
    membership: GroupMembership,
    db: DbSession,
    user_id: UserFilter = None,
    date_from: DateFilter = None,
    date_to: DateFilter = None,
) -> MonthlyTrendOut:
    """Monthly totals, oldest first. Months with no spending are returned as
    zero rather than skipped, so a line chart cannot imply a false trend."""
    group = membership.group
    points = analytics_service.by_month(
        db, group, user_id=user_id, date_from=date_from, date_to=date_to
    )
    return MonthlyTrendOut(
        group_id=group.id,
        currency=group.currency,
        scope="group" if user_id is None else "user",
        months=[MonthPointOut(**vars(p)) for p in points],
    )


@router.get("/{group_id}/analytics/by-member", response_model=MemberBreakdownOut)
def get_by_member(
    membership: GroupMembership,
    db: DbSession,
    date_from: DateFilter = None,
    date_to: DateFilter = None,
) -> MemberBreakdownOut:
    """What each person laid out versus what they consumed. This is a spending
    breakdown, not a debt position -- see /balances for who owes whom."""
    group = membership.group
    slices = analytics_service.by_member(db, group, date_from=date_from, date_to=date_to)
    return MemberBreakdownOut(
        group_id=group.id,
        currency=group.currency,
        members=[
            MemberSliceOut(user=UserOut.model_validate(s.user), paid=s.paid, consumed=s.consumed)
            for s in slices
        ],
    )


@router.get("/{group_id}/analytics/anomalies", response_model=AnomalyReportOut)
def get_anomalies(
    membership: GroupMembership,
    db: DbSession,
    direction: Annotated[
        AnomalyDirection | None,
        Query(description="Only unusually high, or only unusually low, amounts"),
    ] = None,
    date_from: DateFilter = None,
    date_to: DateFilter = None,
) -> AnomalyReportOut:
    """Expenses that do not look like their own history, worst first.

    Expenses are grouped into series by title, so "Electricity bill" is compared
    against previous electricity bills rather than against the weekly shop. A
    title that has not appeared at least five times is never flagged -- there is
    no history to judge it against.

    `date_from` / `date_to` narrow what is reported, not what the baseline is
    built from.
    """
    group = membership.group
    found = anomaly_service.detect(
        db, group, direction=direction, date_from=date_from, date_to=date_to
    )
    return AnomalyReportOut(
        group_id=group.id,
        currency=group.currency,
        anomalies=[
            AnomalyOut(
                expense=ExpenseBrief.model_validate(a.expense, from_attributes=True),
                series_label=a.series_label,
                series_size=a.series_size,
                baseline=a.baseline,
                difference=a.difference,
                percent_change=a.percent_change,
                score=a.score,
                direction=a.direction,
            )
            for a in found
        ],
    )


@router.post("/{group_id}/analytics/ask", response_model=AskResponse)
def ask_question(
    payload: AskRequest,
    membership: GroupMembership,
    readonly: ReadOnlyConnection,
) -> AskResponse:
    """Ask a question about this group's spending in plain language.

    Claude translates the question into a single PostgreSQL SELECT, which is
    then validated against an allowlist, wrapped so it can only see this group's
    data, and run in a read-only transaction with a statement timeout and a row
    cap. The SQL that ran comes back in the response so the answer can be
    checked rather than taken on faith.

    Returns 503 when the server has no Anthropic API key configured.
    """
    result = nl_query_service.ask(readonly, membership.group, question=payload.question)
    return AskResponse(
        question=result.question,
        sql=result.sql,
        explanation=result.explanation,
        columns=result.columns,
        rows=result.rows,
        row_count=result.row_count,
        truncated=result.truncated,
    )
