"""Budget business rules. Owns the transaction.

Two jobs: keeping the budgets themselves, and noticing when one is being blown.
The noticing happens inside `create_expense`, because the moment an expense
lands is the only moment anybody wants to hear about it -- a report you have to
go and look at is a report nobody reads.
"""

import uuid
from calendar import monthrange
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.config import settings
from app.core.errors import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.domain.budgets import BudgetLevel, is_worse, level_for, remaining, share_used
from app.models.budget import Budget
from app.models.enums import ExpenseCategory, MemberRole, NotificationKind
from app.models.expense import Expense
from app.models.group import Group, GroupMember
from app.models.user import User
from app.repositories.budget_repository import BudgetRepository
from app.repositories.group_repository import GroupRepository
from app.services import group_service, notification_service

_ALERT_KIND = {
    BudgetLevel.WARNING: NotificationKind.BUDGET_WARNING,
    BudgetLevel.EXCEEDED: NotificationKind.BUDGET_EXCEEDED,
}


@dataclass(frozen=True)
class BudgetStatus:
    budget: Budget
    month: str
    spent: Decimal
    remaining: Decimal
    share_used: Decimal
    level: BudgetLevel


def _require_owner(membership: GroupMember) -> None:
    if membership.role is not MemberRole.OWNER:
        raise ForbiddenError("Only a group owner can change budgets")


def _month_label(when: date) -> str:
    return f"{when.year:04d}-{when.month:02d}"


def parse_month(value: str | None) -> tuple[int, int]:
    """ "2026-09" -> (2026, 9). Defaults to the current month."""
    if value is None:
        today = date.today()
        return today.year, today.month
    try:
        year_text, month_text = value.split("-")
        year, month = int(year_text), int(month_text)
        monthrange(year, month)  # raises for month 0 or 13
    except (ValueError, IndexError) as error:
        raise BadRequestError("Month must look like 2026-09") from error
    return year, month


def _status(db: Session, budget: Budget, *, year: int, month: int) -> BudgetStatus:
    spent = BudgetRepository(db).spent_in_month(
        budget.group_id, budget.category, year=year, month=month
    )
    return BudgetStatus(
        budget=budget,
        month=f"{year:04d}-{month:02d}",
        spent=spent,
        remaining=remaining(spent, budget.amount),
        share_used=share_used(spent, budget.amount),
        level=level_for(spent, budget.amount, warning_threshold=settings.budget_warning_threshold),
    )


# --- keeping budgets ---------------------------------------------------------


def get_budget(db: Session, group: Group, budget_id: uuid.UUID) -> Budget:
    budget = BudgetRepository(db).get(budget_id)
    if budget is None or budget.group_id != group.id:
        raise NotFoundError("Budget not found")
    return budget


def list_status(db: Session, group: Group, *, month: str | None = None) -> list[BudgetStatus]:
    """Every budget with what has been spent against it, for one month."""
    year, month_number = parse_month(month)
    return [
        _status(db, budget, year=year, month=month_number)
        for budget in BudgetRepository(db).list_by_group(group.id)
    ]


def create_budget(
    db: Session,
    group: Group,
    *,
    membership: GroupMember,
    creator: User,
    category: ExpenseCategory | None,
    amount: Decimal,
) -> Budget:
    _require_owner(membership)
    group_service.require_open(group)
    if amount <= 0:
        raise BadRequestError("A budget has to be more than zero")

    repo = BudgetRepository(db)
    existing = repo.get_for_category(group.id, category) if category else repo.get_overall(group.id)
    if existing is not None:
        target = category.value if category else "the whole group"
        raise ConflictError(f"This group already has a budget for {target}. Edit it instead.")

    budget = Budget(group_id=group.id, category=category, amount=amount, created_by=creator.id)
    repo.add(budget)
    db.commit()
    db.refresh(budget)
    return budget


def update_budget(
    db: Session, budget: Budget, *, membership: GroupMember, amount: Decimal
) -> Budget:
    """Changing the amount clears the alert state.

    Raising a budget that was already blown should not leave everyone silently
    un-warnable for the rest of the month, and lowering one should be allowed to
    speak up straight away.
    """
    _require_owner(membership)
    group_service.require_open(membership.group)
    if amount <= 0:
        raise BadRequestError("A budget has to be more than zero")

    if amount != budget.amount:
        budget.amount = amount
        budget.alerted_period = None
        budget.alerted_level = None

    db.commit()
    db.refresh(budget)
    return budget


def delete_budget(db: Session, budget: Budget, *, membership: GroupMember) -> None:
    _require_owner(membership)
    BudgetRepository(db).delete(budget)
    db.commit()


# --- noticing (called from inside expense_service's transaction) -------------


def check_after_expense(db: Session, group: Group, expense: Expense) -> None:
    """Raise a notification if this expense pushed a budget past a threshold.

    Called after the expense has been added and before the commit, so the
    pending row is included in the total -- the query autoflushes it. Never
    commits: the expense owns that.

    At most one alert per budget per month per level. Without that, the twelfth
    expense over the line raises a twelfth notification and everyone stops
    reading them.
    """
    repo = BudgetRepository(db)
    month = _month_label(expense.expense_date)

    # An expense with no category counts against the OTHER budget, the same way
    # analytics folds uncategorised spending into OTHER.
    category = expense.category or ExpenseCategory.OTHER
    candidates = [repo.get_for_category(group.id, category), repo.get_overall(group.id)]

    recipients: list[uuid.UUID] | None = None
    for budget in candidates:
        if budget is None:
            continue

        status = _status(
            db, budget, year=expense.expense_date.year, month=expense.expense_date.month
        )
        if status.level is BudgetLevel.OK:
            continue

        # A different month is news whatever was said about the last one;
        # the same month is only news if it has got worse.
        already_said = budget.alerted_level if budget.alerted_period == month else None
        if not is_worse(status.level, already_said):
            continue

        if recipients is None:
            recipients = [m.user_id for m in GroupRepository(db).active_members(group.id)]

        notification_service.record_budget_alert(
            db,
            group,
            kind=_ALERT_KIND[status.level],
            recipients=recipients,
            category=budget.category.value if budget.category else None,
            spent=status.spent,
            limit=budget.amount,
            share_used=status.share_used,
            month=month,
        )
        budget.alerted_period = month
        budget.alerted_level = status.level
