"""Min-cash-flow: turn a set of net balances into as few transfers as possible.

Pure functions: numbers in, numbers out. No database, no FastAPI.

The problem in general ("what is the *fewest* possible transfers") is NP-hard,
because finding subsets that cancel exactly is subset-sum. What we do instead:

  1. Pair off people whose debt and credit match exactly. Each such pair costs
     one transfer and removes two people, which is the best any plan can do.
  2. Greedily match the largest remaining debtor against the largest remaining
     creditor.

Step 2 alone already guarantees at most n-1 transfers, because every transfer
zeroes at least one person. Step 1 is a cheap improvement that catches the case
real flatmates hit most often -- "you owe me exactly what I owe her".

All arithmetic runs in integer cents so nothing drifts.
"""

import uuid
from dataclasses import dataclass
from decimal import ROUND_DOWN, Decimal

from app.core.errors import BadRequestError

CENT = Decimal("0.01")


@dataclass(frozen=True)
class Transfer:
    """`from_user_id` should pay `to_user_id` this amount."""

    from_user_id: uuid.UUID
    to_user_id: uuid.UUID
    amount: Decimal


def _to_cents(net_balances: dict[uuid.UUID, Decimal]) -> dict[uuid.UUID, int]:
    cents = {}
    for user_id, value in net_balances.items():
        if value != value.quantize(CENT, rounding=ROUND_DOWN):
            raise BadRequestError("Balances cannot have sub-cent precision")
        cents[user_id] = int((value * 100).to_integral_value())

    if sum(cents.values()) != 0:
        # Every expense creates matching credit and debt, so a non-zero sum
        # means the balance query itself is wrong. Fail loudly rather than
        # inventing money.
        raise BadRequestError("Balances must net to zero")
    return cents


def _exact_pair(
    debtors: dict[uuid.UUID, int], creditors: dict[uuid.UUID, int]
) -> tuple[uuid.UUID, uuid.UUID] | None:
    """A debtor who owes exactly what some creditor is owed. Lowest ids win, so
    the result is deterministic."""
    for debtor in sorted(debtors):
        for creditor in sorted(creditors):
            if debtors[debtor] == creditors[creditor]:
                return debtor, creditor
    return None


def minimise_transfers(net_balances: dict[uuid.UUID, Decimal]) -> list[Transfer]:
    """Return the transfers that settle everyone up.

    A positive balance means the person is owed money; negative means they owe.
    People with a zero balance are left out entirely.
    """
    cents = _to_cents(net_balances)

    creditors = {user: amount for user, amount in cents.items() if amount > 0}
    debtors = {user: -amount for user, amount in cents.items() if amount < 0}

    transfers: list[Transfer] = []
    while debtors and creditors:
        pair = _exact_pair(debtors, creditors)
        if pair is not None:
            debtor, creditor = pair
        else:
            # Largest first; iterating sorted ids makes ties deterministic.
            debtor = max(sorted(debtors), key=lambda user: debtors[user])
            creditor = max(sorted(creditors), key=lambda user: creditors[user])

        amount = min(debtors[debtor], creditors[creditor])
        transfers.append(
            Transfer(
                from_user_id=debtor,
                to_user_id=creditor,
                amount=(Decimal(amount) / 100).quantize(CENT),
            )
        )

        debtors[debtor] -= amount
        creditors[creditor] -= amount
        if debtors[debtor] == 0:
            del debtors[debtor]
        if creditors[creditor] == 0:
            del creditors[creditor]

    return transfers
