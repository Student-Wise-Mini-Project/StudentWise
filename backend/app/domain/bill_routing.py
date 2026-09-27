"""Which flat does a bill from email belong to, and may it be split unasked?

Pure: facts in, a decision out. The service gathers the facts (who sent it,
which flats the mailbox owner lives in, what recurring bills they have) and
this decides, so every branch can be tested without a database or a mailbox.

The order of the checks is the policy:

1. No amount -> review. Nothing is ever split for an amount nobody read.
2. No flat -> review. Trips, couples and solo groups never get a utility bill.
3. One flat -> that flat. Several -> by address, and only if one stands out.
4. Unknown sender -> review, *with* the flat suggested. Anyone can email a
   convincing "לתשלום"; only known utilities are split without a person.
5. A fixed-amount recurring bill of the same kind already posts itself in that
   flat -> review, or the same month is paid twice.
"""

import uuid
from dataclasses import dataclass

from app.domain.address_matching import best_flat
from app.models.enums import BillReviewReason


@dataclass(frozen=True)
class FlatFacts:
    group_id: uuid.UUID
    address: str | None
    #: An active recurring bill with a fixed amount, of this bill's category.
    has_fixed_recurring: bool


@dataclass(frozen=True)
class RouteDecision:
    #: Set only when the bill may be split now.
    group_id: uuid.UUID | None
    #: Set only when it may not.
    reason: BillReviewReason | None
    #: The flat to preselect on the review screen, when there is a good guess.
    suggested_group_id: uuid.UUID | None
    address_score: int | None


def _review(
    reason: BillReviewReason, suggested: uuid.UUID | None = None, score: int | None = None
) -> RouteDecision:
    return RouteDecision(
        group_id=None, reason=reason, suggested_group_id=suggested, address_score=score
    )


def route_bill(
    *,
    amount_known: bool,
    trusted_sender: bool,
    flats: list[FlatFacts],
    service_address: str | None,
    threshold: int,
    margin: int,
) -> RouteDecision:
    if not amount_known:
        return _review(BillReviewReason.NO_AMOUNT)
    if not flats:
        return _review(BillReviewReason.NO_FLAT)

    score: int | None = None
    if len(flats) == 1:
        flat = flats[0]
    else:
        match = best_flat(
            service_address,
            [(f.group_id, f.address) for f in flats],
            threshold=threshold,
            margin=margin,
        )
        if match.group_id is None:
            return _review(BillReviewReason.AMBIGUOUS_FLAT, match.best_guess, match.score or None)
        flat = next(f for f in flats if f.group_id == match.group_id)
        score = match.score

    if not trusted_sender:
        return _review(BillReviewReason.UNKNOWN_SENDER, flat.group_id, score)
    if flat.has_fixed_recurring:
        return _review(BillReviewReason.RECURRING_CONFLICT, flat.group_id, score)

    return RouteDecision(
        group_id=flat.group_id, reason=None, suggested_group_id=flat.group_id, address_score=score
    )


def sender_is_trusted(sender_email: str | None, trusted_domains: list[str]) -> bool:
    """The sender's domain is a listed utility, or a subdomain of one.

    Exact suffix on a dot boundary: "billing.iec.co.il" is trusted,
    "fake-iec.co.il" and "iec.co.il.evil.com" are not.
    """
    if not sender_email or "@" not in sender_email:
        return False
    domain = sender_email.rsplit("@", 1)[1].strip().lower().rstrip(">")
    return any(domain == d or domain.endswith(f".{d}") for d in trusted_domains)
