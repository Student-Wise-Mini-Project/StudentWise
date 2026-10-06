"""What the money assistant can look at (mission 8.2). Read-only by construction.

Every tool is a thin call to a service that is already tested on its own --
the same numbers the Insights and Balances screens show -- so the assistant
never does arithmetic the app has not. None of them writes: the assistant can
explain a balance but never move one. Recording a payment or an expense stays
something a person does on the ordinary screens.

Anything the fixed tools cannot answer goes to `query_database`, which is the
Ask screen's Text-to-SQL, with the same guard, group scope and read-only
transaction (see `nl_query_service`).

Results are plain JSON: money as strings, exactly as the API returns it.
"""

import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import Connection
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.ai import embeddings
from app.core.errors import AppError
from app.models.enums import ExpenseCategory
from app.models.expense import Expense
from app.models.group import Group
from app.repositories.group_repository import GroupRepository
from app.services import (
    analytics_service,
    anomaly_service,
    balance_service,
    duplicate_service,
    expense_service,
    nl_query_service,
    semantic_search_service,
)

MAX_LISTED = 50
MAX_ROWS = 50


@dataclass(frozen=True)
class ToolContext:
    db: Session
    #: For `query_database` only: a READ ONLY transaction, as on /ask.
    readonly: Connection
    group: Group
    language: str


class ToolError(Exception):
    """Told to the model as a failed tool call, so it can try again or say so."""


# --- the definitions the model sees --------------------------------------------------

_DATE = {"type": "string", "description": "YYYY-MM-DD, inclusive."}
_MEMBER = {
    "type": "string",
    "description": "A member's name, to see only their own share. Omit for the whole group.",
}
_PERIOD = {"date_from": _DATE, "date_to": _DATE}


def _tool(name: str, description: str, properties: dict, required: tuple = ()) -> dict:
    return {
        "name": name,
        "description": description,
        "input_schema": {
            "type": "object",
            "properties": properties,
            "required": list(required),
            "additionalProperties": False,
        },
    }


TOOLS: list[dict[str, Any]] = [
    _tool(
        "spending_summary",
        "Total spent, number of expenses, average and largest expense, and the first and "
        "last date. With `member`, that person's own share of each expense instead.",
        {"member": _MEMBER, **_PERIOD},
    ),
    _tool(
        "spending_by_category",
        "Spending per category, biggest first, with each one's share of the total.",
        {"member": _MEMBER, **_PERIOD},
    ),
    _tool(
        "spending_by_month",
        "Spending per calendar month, oldest first. Months with nothing are included as zero.",
        {"member": _MEMBER, **_PERIOD},
    ),
    _tool(
        "spending_by_member",
        "Per person: what they paid out of pocket, and what they consumed (their share). "
        "This is spending, not debt -- repayments are not in it. Use `balances` for who owes.",
        _PERIOD,
    ),
    _tool(
        "balances",
        "Who owes whom right now, repayments included: each person's net balance "
        "(positive = they are owed) and the fewest transfers that would settle everyone up.",
        {},
    ),
    _tool(
        "unusual_expenses",
        "Expenses far above or below their own history (an electricity bill three times the "
        "usual), worst first, each with what it usually costs.",
        _PERIOD,
    ),
    _tool(
        "possible_duplicates",
        "Pairs of expenses that look like one payment recorded twice, with the reasons.",
        _PERIOD,
    ),
    _tool(
        "list_expenses",
        "Individual expenses, newest first, with who paid and who shared each one. Filter by "
        "category, payer or dates.",
        {
            "category": {"type": "string", "enum": [c.value for c in ExpenseCategory]},
            "payer": {"type": "string", "description": "The name of the person who paid."},
            **_PERIOD,
            "limit": {"type": "integer", "minimum": 1, "maximum": MAX_LISTED},
        },
    ),
    _tool(
        "query_database",
        "For anything the other tools cannot answer -- a particular kind of bill by name, a "
        "comparison, a count. Write the question in plain words; it is turned into a "
        "read-only SQL query over this group's data and the rows come back.",
        {"question": {"type": "string", "description": "One precise question, in words."}},
        required=("question",),
    ),
    _tool(
        "search_expenses",
        "Find expenses by what they were rather than their exact title: 'the Italian "
        "place', 'something for the kitchen', 'פיצה'. Matches meaning across Hebrew and "
        "English, in titles and notes. Returns the closest expenses with a similarity score "
        "(0 to 1); a low score means probably not what was meant.",
        {
            "query": {"type": "string", "description": "What to look for, in words."},
            **_PERIOD,
            "limit": {"type": "integer", "minimum": 1, "maximum": 25},
        },
        required=("query",),
    ),
]


# --- running them ---------------------------------------------------------------------


def _money(value: Decimal | None) -> str | None:
    return None if value is None else str(value)


def _date(arguments: dict[str, Any], key: str) -> date | None:
    value = arguments.get(key)
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(str(value))
    except ValueError as error:
        raise ToolError(f"{key} must be a date written YYYY-MM-DD, not {value!r}") from error


def _period(arguments: dict[str, Any]) -> dict[str, date | None]:
    return {"date_from": _date(arguments, "date_from"), "date_to": _date(arguments, "date_to")}


def _member_id(ctx: ToolContext, name: Any) -> uuid.UUID | None:
    """A name to a member of this group. Everyone ever in it, as balances do."""
    if name in (None, ""):
        return None
    members = GroupRepository(ctx.db).all_memberships(ctx.group.id)
    wanted = str(name).strip().casefold()
    for membership in members:
        if membership.user.name.casefold() == wanted:
            return membership.user_id
    names = ", ".join(m.user.name for m in members)
    raise ToolError(f"No member is called {name!r}. The members are: {names}.")


def _brief(expense: Expense | None) -> dict[str, Any] | None:
    if expense is None:
        return None
    return {
        "title": expense.title,
        "amount": _money(expense.total_amount),
        "date": expense.expense_date.isoformat(),
        "category": expense.category.value if expense.category else None,
    }


def _spending_summary(ctx: ToolContext, arguments: dict[str, Any]) -> dict[str, Any]:
    result = analytics_service.summary(
        ctx.db, ctx.group, user_id=_member_id(ctx, arguments.get("member")), **_period(arguments)
    )
    return {
        "total": _money(result.total_spent),
        "expense_count": result.expense_count,
        "average": _money(result.average_expense),
        "largest": _brief(result.largest_expense),
        "first_date": result.first_expense_date.isoformat() if result.first_expense_date else None,
        "last_date": result.last_expense_date.isoformat() if result.last_expense_date else None,
    }


def _spending_by_category(ctx: ToolContext, arguments: dict[str, Any]) -> dict[str, Any]:
    slices = analytics_service.by_category(
        ctx.db, ctx.group, user_id=_member_id(ctx, arguments.get("member")), **_period(arguments)
    )
    return {
        "categories": [
            {
                "category": s.category.value,
                "total": _money(s.total),
                "expense_count": s.expense_count,
                "percent": str(s.share_percent),
            }
            for s in slices
        ]
    }


def _spending_by_month(ctx: ToolContext, arguments: dict[str, Any]) -> dict[str, Any]:
    points = analytics_service.by_month(
        ctx.db, ctx.group, user_id=_member_id(ctx, arguments.get("member")), **_period(arguments)
    )
    return {
        "months": [
            {"month": p.month, "total": _money(p.total), "expense_count": p.expense_count}
            for p in points
        ]
    }


def _spending_by_member(ctx: ToolContext, arguments: dict[str, Any]) -> dict[str, Any]:
    slices = analytics_service.by_member(ctx.db, ctx.group, **_period(arguments))
    return {
        "members": [
            {"name": s.user.name, "paid": _money(s.paid), "consumed": _money(s.consumed)}
            for s in slices
        ]
    }


def _balances(ctx: ToolContext, arguments: dict[str, Any]) -> dict[str, Any]:
    balances = balance_service.compute_balances(ctx.db, ctx.group)
    plan = balance_service.compute_settlement_plan(ctx.db, ctx.group)
    return {
        "balances": [
            {
                "name": b.user.name,
                "net": _money(b.net),
                "paid": _money(b.paid),
                "share": _money(b.owed),
                "repayments_sent": _money(b.settlements_sent),
                "repayments_received": _money(b.settlements_received),
            }
            for b in balances
        ],
        "settle_up": [
            {"from": t.from_user.name, "to": t.to_user.name, "amount": _money(t.amount)}
            for t in plan
        ],
    }


def _unusual_expenses(ctx: ToolContext, arguments: dict[str, Any]) -> dict[str, Any]:
    found = anomaly_service.detect(ctx.db, ctx.group, **_period(arguments))
    return {
        "unusual": [
            {
                **_brief(a.expense),
                "usually": _money(a.baseline),
                "direction": a.direction.value,
                "percent_change": str(a.percent_change),
                "compared_with": f"{a.series_size} earlier '{a.series_label}' expenses",
            }
            for a in found[:MAX_LISTED]
        ]
    }


def _possible_duplicates(ctx: ToolContext, arguments: dict[str, Any]) -> dict[str, Any]:
    found = duplicate_service.detect(ctx.db, ctx.group, **_period(arguments))
    return {
        "pairs": [
            {
                "first": {**_brief(d.first), "paid_by": d.first.payer.name},
                "second": {**_brief(d.second), "paid_by": d.second.payer.name},
                "days_apart": d.day_gap,
                "reasons": list(d.reasons),
            }
            for d in found[:MAX_LISTED]
        ]
    }


def _list_expenses(ctx: ToolContext, arguments: dict[str, Any]) -> dict[str, Any]:
    category = arguments.get("category")
    try:
        category = ExpenseCategory(category) if category else None
    except ValueError as error:
        raise ToolError(f"Unknown category {category!r}") from error
    limit = min(max(int(arguments.get("limit") or 20), 1), MAX_LISTED)

    expenses, total = expense_service.list_expenses(
        ctx.db,
        ctx.group,
        limit=limit,
        category=category,
        payer_id=_member_id(ctx, arguments.get("payer")),
        **_period(arguments),
    )
    return {
        "total_matching": total,
        "expenses": [
            {
                **_brief(e),
                "paid_by": e.payer.name,
                "shared_by": [
                    {"name": s.user.name, "share": _money(s.owed_amount)} for s in e.splits
                ],
                "notes": e.notes,
            }
            for e in expenses
        ],
    }


def _search_expenses(ctx: ToolContext, arguments: dict[str, Any]) -> dict[str, Any]:
    matches = semantic_search_service.search(
        ctx.db,
        ctx.group,
        str(arguments.get("query") or ""),
        limit=int(arguments.get("limit") or 8),
        **_period(arguments),
    )
    return {
        "matches": [
            {
                **_brief(m.expense),
                "paid_by": m.expense.payer.name,
                "shared_by": [s.user.name for s in m.expense.splits],
                "notes": m.expense.notes,
                "similarity": m.score,
            }
            for m in matches
        ]
    }


def _query_database(ctx: ToolContext, arguments: dict[str, Any]) -> dict[str, Any]:
    question = str(arguments.get("question") or "").strip()
    if len(question) < 3:
        raise ToolError("Ask a question in words.")

    # A query that fails aborts the transaction it ran in. The savepoint keeps
    # the read-only connection usable for the next tool call in this answer.
    savepoint = ctx.readonly.begin_nested()
    try:
        result = nl_query_service.ask(
            ctx.readonly, ctx.group, question=question, language=ctx.language
        )
    except AppError as error:
        raise ToolError(error.detail) from error
    except DBAPIError as error:
        raise ToolError("That query failed to run. Try asking it differently.") from error
    finally:
        savepoint.rollback()

    return {
        "explanation": result.explanation,
        "sql": result.sql,
        "columns": result.columns,
        "rows": result.rows[:MAX_ROWS],
        "row_count": result.row_count,
        "truncated": result.truncated or result.row_count > MAX_ROWS,
    }


_RUNNERS = {
    "spending_summary": _spending_summary,
    "spending_by_category": _spending_by_category,
    "spending_by_month": _spending_by_month,
    "spending_by_member": _spending_by_member,
    "balances": _balances,
    "unusual_expenses": _unusual_expenses,
    "possible_duplicates": _possible_duplicates,
    "list_expenses": _list_expenses,
    "query_database": _query_database,
    "search_expenses": _search_expenses,
}

assert set(_RUNNERS) == {tool["name"] for tool in TOOLS}, "every tool needs a runner"


def available() -> list[dict[str, Any]]:
    """The tools to offer. Semantic search only when it can work: offering a
    tool that always fails would cost the model a turn to find that out."""
    if embeddings.configured():
        return TOOLS
    return [tool for tool in TOOLS if tool["name"] != "search_expenses"]


def run(ctx: ToolContext, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """Run one tool. Raises ToolError for anything the model should be told."""
    runner = _RUNNERS.get(name)
    if runner is None:
        raise ToolError(f"There is no tool called {name!r}.")
    if not isinstance(arguments, dict):
        raise ToolError("Tool input must be an object.")
    try:
        return runner(ctx, arguments)
    except AppError as error:
        # The services' own refusals ("not a member of this group") are worth
        # passing on: the model can correct itself.
        raise ToolError(error.detail) from error
    except (TypeError, ValueError) as error:
        raise ToolError(f"Invalid input for {name}: {error}") from error
