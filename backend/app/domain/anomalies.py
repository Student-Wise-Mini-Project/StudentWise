"""Anomaly detection over a series of amounts.

Pure functions: numbers in, numbers out. No database, no FastAPI, no AI.

## Why median and MAD

The obvious approach -- mean and standard deviation -- is the wrong tool here.
Both are dragged around by the very outlier we are hunting, and with the handful
of observations a real flatshare produces (a year of electricity bills is twelve
numbers) one bad month can shift the mean enough to hide itself.

So we use the **median** for the centre and the **median absolute deviation**
for the spread, and score each point with the modified z-score:

    score = 0.6745 * (amount - median) / MAD

The 0.6745 is the constant that makes MAD comparable to a standard deviation for
normally distributed data, so the conventional 3.5 threshold means roughly the
same thing it always does. Both statistics ignore up to half the sample being
extreme, which is what "robust" buys us.

## Leave-one-out

Each amount is judged against the *rest* of its series, never including itself.
Otherwise a single enormous value inflates the spread until nothing looks
unusual -- the masking effect, and the reason `[50, 50, 50, 50, 50, 100000]`
would otherwise come back clean.

## Two guards against crying wolf

1. **A relative floor.** A fixed rent of exactly 3000 four times running has zero
   spread, so *any* change is infinitely many deviations and 3000 -> 3010 would
   be reported. An anomaly must also differ from the baseline by at least
   `min_relative_change`, which additionally means every result carries a
   human-readable justification: "50% above the usual 3000".
2. **A minimum history.** With one or two prior observations everything looks
   unusual, so we stay quiet until there are at least `min_history` others.

The whole thing is explainable in two sentences to someone reading the output,
which matters more here than sophistication.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum

# Makes MAD comparable to a standard deviation under a normal distribution.
MAD_TO_SIGMA = Decimal("0.6745")

DEFAULT_THRESHOLD = Decimal("3.5")
DEFAULT_MIN_HISTORY = 4
DEFAULT_MIN_RELATIVE_CHANGE = Decimal("0.15")

# Reported when the history has no spread at all, so the true score is infinite.
SCORE_CAP = Decimal("999.99")

PERCENT = Decimal("0.1")


class AnomalyDirection(StrEnum):
    HIGH = "HIGH"
    LOW = "LOW"


@dataclass(frozen=True)
class SeriesAnomaly:
    """One amount that does not look like the rest of its series."""

    index: int
    amount: Decimal
    baseline: Decimal
    difference: Decimal
    percent_change: Decimal
    score: Decimal
    direction: AnomalyDirection


def _median(values: Sequence[Decimal]) -> Decimal:
    ordered = sorted(values)
    count = len(ordered)
    middle = count // 2
    if count % 2:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2


def _score(amount: Decimal, others: Sequence[Decimal], baseline: Decimal) -> Decimal:
    """Modified z-score of `amount` against `others`.

    A MAD of zero means more than half the history is identical -- the normal
    state of affairs for rent. The spread of the bulk really is zero, so any
    deviation is infinitely many of them: cap the score and let the
    relative-change floor decide whether it is worth reporting.

    The textbook move here is to fall back to *mean* absolute deviation, but
    that statistic is not robust. On [50, 50, 50, 50, 50, 900, 400] the 900
    inflates it enough to hide the 400 -- reintroducing exactly the masking that
    leave-one-out exists to prevent.
    """
    deviation = amount - baseline
    if deviation == 0:
        return Decimal(0)

    mad = _median([abs(value - baseline) for value in others])
    if mad > 0:
        return MAD_TO_SIGMA * deviation / mad

    return SCORE_CAP if deviation > 0 else -SCORE_CAP


def find_anomalies(
    series: Sequence[Decimal],
    *,
    threshold: Decimal = DEFAULT_THRESHOLD,
    min_history: int = DEFAULT_MIN_HISTORY,
    min_relative_change: Decimal = DEFAULT_MIN_RELATIVE_CHANGE,
) -> list[SeriesAnomaly]:
    """Find the amounts that do not fit their series, worst first.

    Returns an empty list when there is too little history to judge anything.
    """
    if len(series) <= min_history:
        return []

    anomalies: list[SeriesAnomaly] = []
    for index, amount in enumerate(series):
        others = [value for position, value in enumerate(series) if position != index]
        baseline = _median(others)
        score = _score(amount, others, baseline)

        if abs(score) < threshold:
            continue

        difference = amount - baseline
        if baseline == 0:
            # Nothing to be relative to; any spend against a history of zeros is
            # worth surfacing.
            percent_change = SCORE_CAP if difference > 0 else -SCORE_CAP
        else:
            relative = abs(difference) / abs(baseline)
            if relative < min_relative_change:
                continue
            percent_change = (difference * 100 / abs(baseline)).quantize(
                PERCENT, rounding=ROUND_HALF_UP
            )

        anomalies.append(
            SeriesAnomaly(
                index=index,
                amount=amount,
                baseline=baseline,
                difference=difference,
                percent_change=percent_change,
                score=abs(score).quantize(PERCENT, rounding=ROUND_HALF_UP),
                direction=AnomalyDirection.HIGH if difference > 0 else AnomalyDirection.LOW,
            )
        )

    # Worst first. When the history has no spread every score is capped and
    # therefore tied, so the size of the change breaks the tie; index makes
    # the order deterministic after that.
    anomalies.sort(key=lambda found: (-found.score, -abs(found.percent_change), found.index))
    return anomalies
