"""Splitting arithmetic.

Pure functions: numbers in, numbers out. No database, no FastAPI. This is where
the "splits always sum to exactly the total" invariant is enforced, because every
balance in the system depends on it.

Rounding uses the largest-remainder method: floor every share to the cent, then
hand the leftover cents out one at a time to the largest fractional remainders.
That is why 100.00 split three ways gives 33.34 / 33.33 / 33.33 and never 99.99.
Ties are broken by user id, so the result is deterministic.
"""

import uuid
from dataclasses import dataclass
from decimal import ROUND_DOWN, Decimal

from app.core.errors import BadRequestError
from app.models.enums import SplitType

CENT = Decimal("0.01")


@dataclass(frozen=True)
class ParticipantInput:
    """One participant. `share_value` means percentage, weight or exact amount
    depending on the split type, and is ignored for EQUAL."""

    user_id: uuid.UUID
    share_value: Decimal | None = None


@dataclass(frozen=True)
class ComputedSplit:
    user_id: uuid.UUID
    owed_amount: Decimal
    share_value: Decimal | None = None


def _to_cents(value: Decimal, field: str) -> int:
    if value != value.quantize(CENT, rounding=ROUND_DOWN):
        raise BadRequestError(f"{field} cannot have sub-cent precision")
    return int((value * 100).to_integral_value())


def _share_values(participants: list[ParticipantInput], split_type: SplitType) -> list[Decimal]:
    values = []
    for participant in participants:
        if participant.share_value is None:
            raise BadRequestError(
                f"{split_type.value} splits require a value for every participant"
            )
        values.append(participant.share_value)
    return values


def _allocate(total_cents: int, weights: list[Decimal]) -> list[int]:
    """Split `total_cents` proportionally to `weights`, losing nothing."""
    weight_sum = sum(weights)
    if weight_sum <= 0:
        raise BadRequestError("Split weights must add up to more than zero")

    exact = [Decimal(total_cents) * weight / weight_sum for weight in weights]
    floors = [int(value.to_integral_value(rounding=ROUND_DOWN)) for value in exact]

    leftover = total_cents - sum(floors)
    # Largest fractional remainder first; index (i.e. user id order) breaks ties.
    order = sorted(range(len(weights)), key=lambda i: (-(exact[i] - Decimal(floors[i])), i))
    for i in order[:leftover]:
        floors[i] += 1
    return floors


def compute_splits(
    total: Decimal,
    split_type: SplitType,
    participants: list[ParticipantInput],
) -> list[ComputedSplit]:
    """Work out what each participant owes. Returns splits sorted by user id.

    Raises BadRequestError for any input that cannot produce an exact split.
    """
    if not participants:
        raise BadRequestError("An expense needs at least one participant")

    user_ids = [p.user_id for p in participants]
    if len(set(user_ids)) != len(user_ids):
        raise BadRequestError("A participant may only appear once")

    if total <= 0:
        raise BadRequestError("Expense total must be greater than zero")
    total_cents = _to_cents(total, "Expense total")

    ordered = sorted(participants, key=lambda p: p.user_id)

    if split_type is SplitType.EXACT:
        values = _share_values(ordered, split_type)
        if any(value < 0 for value in values):
            raise BadRequestError("Exact amounts cannot be negative")
        cents = [_to_cents(value, "Exact amount") for value in values]
        if sum(cents) != total_cents:
            raise BadRequestError("Exact amounts must add up to the expense total")
    else:
        if split_type is SplitType.EQUAL:
            weights = [Decimal(1)] * len(ordered)
        elif split_type is SplitType.PERCENTAGE:
            weights = _share_values(ordered, split_type)
            if any(weight < 0 for weight in weights):
                raise BadRequestError("Percentages cannot be negative")
            if sum(weights) != Decimal(100):
                raise BadRequestError("Percentages must add up to 100")
        elif split_type is SplitType.WEIGHT:
            weights = _share_values(ordered, split_type)
            if any(weight <= 0 for weight in weights):
                raise BadRequestError("Weights must be greater than zero")
        else:  # pragma: no cover - the enum has no other members
            raise BadRequestError(f"Unsupported split type: {split_type}")

        cents = _allocate(total_cents, weights)

    return [
        ComputedSplit(
            user_id=participant.user_id,
            owed_amount=(Decimal(amount) / 100).quantize(CENT),
            share_value=participant.share_value,
        )
        for participant, amount in zip(ordered, cents, strict=True)
    ]
