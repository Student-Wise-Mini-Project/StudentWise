"""Finding expenses that look like the same payment entered twice.

Pure arithmetic and string comparison: numbers and titles in, pairs out. No
database, no FastAPI.

**This is not anomaly detection.** `domain/anomalies.py` asks whether one
expense is unlike its own history -- a 1244 electricity bill against a usual
400. This asks whether *two* expenses are the same event, which is a different
shape of question and needs different evidence: they have to be close in money,
close in time, and close in wording, all at once.

Three things actually happen in a flatshare, and the scoring is built around
them rather than around a general notion of similarity:

* Two people both pay the same bill, not knowing the other did. Different
  payers, same amount, a day or two apart.
* One person taps *Add* twice. Same payer, same amount, same day.
* Somebody records a bill that was already recorded last week under a slightly
  different name.

The output is a **report, not a block**. Two coffees at 12.00 on the same day
look exactly like a double tap and are not one, so a person decides.
"""

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from difflib import SequenceMatcher
from typing import Any

#: How far apart two entries can be and still be the same event. Deliberately
#: small: a monthly bill recurs every ~30 days, and nothing here should ever
#: flag January rent against February rent.
DEFAULT_WINDOW_DAYS = 3

#: Amounts within this fraction of each other count as "near". A bill paid by
#: two people is usually identical to the agora, so this only catches typos.
NEAR_AMOUNT_TOLERANCE = Decimal("0.02")

#: Below this, a pair is not worth showing anyone.
DEFAULT_MIN_SCORE = Decimal("0.60")

#: How alike two titles have to read before wording counts as evidence at all.
TITLE_SIMILARITY_FLOOR = 0.55

_PUNCTUATION = re.compile(r"[^\w\s]", re.UNICODE)


@dataclass(frozen=True)
class Candidate:
    """One expense, reduced to the four things that decide this question."""

    key: Any
    amount: Decimal
    when: date
    title: str
    payer_key: Any


@dataclass(frozen=True)
class DuplicatePair:
    first_key: Any
    second_key: Any
    score: Decimal
    day_gap: int
    same_payer: bool
    #: Plain sentences, so the UI can say *why* rather than just show a number.
    reasons: tuple[str, ...]


def normalise_title(title: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace.

    "Electricity bill!!" and "electricity   bill" are the same bill written by
    two different people in a hurry.
    """
    lowered = _PUNCTUATION.sub(" ", title.lower())
    return " ".join(lowered.split())


def title_similarity(left: str, right: str) -> float:
    """0.0 to 1.0. Exactly 1.0 when the normalised titles match."""
    a, b = normalise_title(left), normalise_title(right)
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def _amounts_match(left: Decimal, right: Decimal) -> tuple[bool, bool]:
    """(identical, near). Near means within `NEAR_AMOUNT_TOLERANCE`."""
    if left == right:
        return True, True
    larger = max(abs(left), abs(right))
    if larger == 0:
        return False, False
    return False, (abs(left - right) / larger) <= NEAR_AMOUNT_TOLERANCE


def _score_pair(first: Candidate, second: Candidate, *, window_days: int) -> DuplicatePair | None:
    """Weigh one pair. Returns None when they are not the same event at all.

    The weights are deliberately blunt -- money 0.5, wording 0.3, timing 0.2 --
    because the output is read by a person deciding, not by anything automatic.
    Money carries the most because two entries for different amounts are simply
    two different payments, whatever they are called.
    """
    day_gap = abs((second.when - first.when).days)
    if day_gap > window_days:
        return None

    identical_amount, near_amount = _amounts_match(first.amount, second.amount)
    if not near_amount:
        return None

    similarity = title_similarity(first.title, second.title)
    if similarity < TITLE_SIMILARITY_FLOOR:
        return None

    reasons: list[str] = []
    score = Decimal("0")

    if identical_amount:
        score += Decimal("0.50")
        reasons.append(f"Both are exactly {first.amount}")
    else:
        score += Decimal("0.30")
        reasons.append(f"{first.amount} and {second.amount} are within a rounding error")

    if similarity >= 0.999:
        score += Decimal("0.30")
        reasons.append("Same title")
    else:
        score += (Decimal("0.30") * Decimal(str(round(similarity, 4)))).quantize(Decimal("0.01"))
        reasons.append(f"Titles read almost the same ({similarity:.0%})")

    # Same day is the strongest timing signal and decays to nothing at the edge
    # of the window.
    timing = Decimal("0.20") * (Decimal(window_days + 1 - day_gap) / Decimal(window_days + 1))
    score += timing.quantize(Decimal("0.01"))
    if day_gap == 0:
        reasons.append("Entered for the same day")
    else:
        reasons.append(f"{day_gap} day{'s' if day_gap > 1 else ''} apart")

    same_payer = first.payer_key == second.payer_key
    if same_payer:
        reasons.append("Same person paid both -- looks like it was entered twice")
    else:
        reasons.append("Two different people paid -- looks like the bill was covered twice")

    return DuplicatePair(
        first_key=first.key,
        second_key=second.key,
        score=min(score, Decimal("1.00")).quantize(Decimal("0.01")),
        day_gap=day_gap,
        same_payer=same_payer,
        reasons=tuple(reasons),
    )


def find_duplicates(
    candidates: Iterable[Candidate],
    *,
    window_days: int = DEFAULT_WINDOW_DAYS,
    min_score: Decimal = DEFAULT_MIN_SCORE,
) -> list[DuplicatePair]:
    """Every pair that looks like one payment recorded twice, likeliest first.

    Candidates are sorted by date and compared only against the ones still
    inside the window, so this costs O(n · k) rather than O(n²) -- k being how
    many expenses land within a few days of each other, which stays small.
    """
    if window_days < 0:
        raise ValueError("window_days cannot be negative")

    ordered: Sequence[Candidate] = sorted(candidates, key=lambda c: (c.when, str(c.key)))

    pairs: list[DuplicatePair] = []
    start = 0
    for index, candidate in enumerate(ordered):
        # Walk the left edge forward past everything now out of range.
        while (candidate.when - ordered[start].when).days > window_days:
            start += 1
        for earlier in ordered[start:index]:
            pair = _score_pair(earlier, candidate, window_days=window_days)
            if pair is not None and pair.score >= min_score:
                pairs.append(pair)

    pairs.sort(key=lambda p: (-p.score, p.day_gap, str(p.first_key), str(p.second_key)))
    return pairs
