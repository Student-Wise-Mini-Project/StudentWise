"""Does the address on a bill belong to this flat?

Pure functions: strings in, a score out. No database.

Two rules, in this order:

1. **House numbers are compared exactly.** "דיזנגוף 5" and "דיזנגוף 50" are one
   character apart and any string-similarity score calls them nearly the same
   place. So every number in the flat's address must also appear on the bill;
   if one does not, the score is zero whatever the words say. The bill may have
   more numbers than the flat (an apartment, a floor) -- that is fine.
2. **The words are compared fuzzily**, with rapidfuzz's token-set ratio, after
   dropping the words that only describe an address ("רחוב", "דירה") and
   punctuation. Token-set tolerates one side having extra words, which is how
   a city name on the bill but not in the app, or the reverse, still matches.

A flat is only chosen when it clears a threshold *and* beats the next flat by a
margin. Two flats on the same street in different cities both score 100, and
refusing to pick between them is the correct answer.
"""

import re
import uuid
from dataclasses import dataclass

from rapidfuzz import fuzz

#: Words that say "this is an address" rather than which one. Hebrew and English.
_NOISE = {
    "רחוב",
    "רח",
    "דירה",
    "דיר",
    "קומה",
    "כניסה",
    "מספר",
    "street",
    "st",
    "road",
    "rd",
    "apt",
    "apartment",
    "flat",
    "floor",
    "no",
}

_PUNCTUATION = re.compile(r"[\"'׳״`.,;:()\[\]/\\\-–—_#]+")
_NUMBER = re.compile(r"\d+")


@dataclass(frozen=True)
class NormalisedAddress:
    words: str
    numbers: frozenset[str]


def normalise(address: str) -> NormalisedAddress:
    text = _PUNCTUATION.sub(" ", address.lower())
    numbers = frozenset(n.lstrip("0") or "0" for n in _NUMBER.findall(text))
    # Numbers glued to words ("5א", "15b") still count as numbers above; the
    # letters around them stay as words.
    text = _NUMBER.sub(" ", text)
    words = [w for w in text.split() if w not in _NOISE]
    return NormalisedAddress(words=" ".join(words), numbers=numbers)


def address_score(bill_address: str, flat_address: str) -> int:
    """0-100. Zero when a house number on the flat's address is not on the bill."""
    bill = normalise(bill_address)
    flat = normalise(flat_address)
    if not bill.words or not flat.words:
        return 0
    if not flat.numbers <= bill.numbers:
        return 0
    return round(fuzz.token_set_ratio(bill.words, flat.words))


@dataclass(frozen=True)
class AddressMatch:
    group_id: uuid.UUID | None
    score: int
    #: The best-scoring flat even when it was not confident enough to choose,
    #: so the review screen can suggest it.
    best_guess: uuid.UUID | None


def best_flat(
    bill_address: str | None,
    flats: list[tuple[uuid.UUID, str | None]],
    *,
    threshold: int,
    margin: int,
) -> AddressMatch:
    """The flat this address belongs to, if one stands out clearly enough."""
    if not bill_address:
        return AddressMatch(group_id=None, score=0, best_guess=None)

    scored = sorted(
        (
            (address_score(bill_address, address), group_id)
            for group_id, address in flats
            if address
        ),
        key=lambda pair: (-pair[0], str(pair[1])),
    )
    if not scored or scored[0][0] == 0:
        return AddressMatch(group_id=None, score=0, best_guess=None)

    top_score, top_id = scored[0]
    runner_up = scored[1][0] if len(scored) > 1 else 0
    confident = top_score >= threshold and top_score - runner_up >= margin
    return AddressMatch(group_id=top_id if confident else None, score=top_score, best_guess=top_id)
