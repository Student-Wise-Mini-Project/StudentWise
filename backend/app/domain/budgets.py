"""Budget arithmetic: spent against a limit, and what that means.

Pure. Numbers in, a verdict out. No database, no FastAPI.

Small, but not nothing: it is the only place that decides what "80% of the
grocery budget" rounds to and what happens at exactly the limit, and those are
the two answers a person will argue with.
"""

from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum

#: Warn once spending reaches this share of the limit.
DEFAULT_WARNING_THRESHOLD = Decimal("0.80")

ZERO = Decimal("0.00")


class BudgetLevel(StrEnum):
    OK = "OK"
    WARNING = "WARNING"
    EXCEEDED = "EXCEEDED"


#: Ranked, so "has this got worse since we last said anything?" is a comparison
#: rather than a pile of conditionals.
_RANK = {BudgetLevel.OK: 0, BudgetLevel.WARNING: 1, BudgetLevel.EXCEEDED: 2}


def is_worse(level: BudgetLevel, than: BudgetLevel | None) -> bool:
    if than is None:
        return level is not BudgetLevel.OK
    return _RANK[level] > _RANK[than]


def share_used(spent: Decimal, limit: Decimal) -> Decimal:
    """Percentage of the budget used, to one decimal place.

    A limit of zero has no meaningful percentage -- anything at all is over it
    -- so it reports 0 and `level_for` calls it EXCEEDED. Returning a division
    by zero, or silently 100, would both be worse.
    """
    if limit <= 0:
        return ZERO
    return (spent / limit * 100).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


def remaining(spent: Decimal, limit: Decimal) -> Decimal:
    """What is left. Negative once the budget is blown, because "how far over
    are we" is the thing people actually want to know."""
    return (limit - spent).quantize(Decimal("0.01"))


def level_for(
    spent: Decimal,
    limit: Decimal,
    *,
    warning_threshold: Decimal = DEFAULT_WARNING_THRESHOLD,
) -> BudgetLevel:
    """Where this budget stands.

    Spending *exactly* the limit is EXCEEDED, not OK: the next coffee is over,
    and a budget that only complains at 100.01 is a budget nobody notices in
    time. Spending exactly the warning threshold does warn, for the same reason.
    """
    if limit <= 0:
        return BudgetLevel.EXCEEDED if spent > 0 else BudgetLevel.OK
    if spent >= limit:
        return BudgetLevel.EXCEEDED
    if spent >= (limit * warning_threshold):
        return BudgetLevel.WARNING
    return BudgetLevel.OK
