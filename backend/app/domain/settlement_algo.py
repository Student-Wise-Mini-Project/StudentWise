"""Min-cash-flow: turn a set of net balances into the fewest possible transfers.

Pure functions: numbers in, numbers out. No database, no FastAPI.

## The shape of the problem

Debts form a directed weighted multigraph of who-owes-whom. The first move is a
graph reduction: net every person down to a single number. That destroys every
cycle at once -- "Gal owes Maya, Maya owes Noa, Noa owes Gal" disappears without
ever being searched for. It is why cycle-cancellation is unnecessary here, and
why min-cost-max-flow is the wrong tool (it minimises cost, not edge count).

What remains is numeric. Given balances that sum to zero:

    minimum transfers = n - (largest number of disjoint zero-sum subgroups)

because a subgroup of size k that sums to zero can always be settled internally
in k-1 transfers, and never fewer.

## How we solve it

Finding that largest number of subgroups is NP-hard -- it contains subset-sum.
But n here is a flat, not a nation, so up to `MAX_EXACT_PEOPLE` we just solve it
exactly with a DP over bitmasks (O(3^n)) and get a provably minimal answer.
Above that we fall back to a greedy heuristic, which still guarantees at most
n-1 transfers.

Measured against brute force, the greedy alone was already optimal for every
group of 3-5 people tested, but drifted with size (~4.8% suboptimal at 8 people,
~23.7% at 10). The exact path removes that drift entirely for real group sizes.

All arithmetic runs in integer cents so nothing drifts.
"""

import uuid
from dataclasses import dataclass
from decimal import ROUND_DOWN, Decimal

from app.core.errors import BadRequestError

CENT = Decimal("0.01")

# Measured on the dev machine at 14 people: ~14ms on realistic balances, and
# ~240ms on an adversarial worst case (everyone's net within a couple of cents,
# which maximises the number of zero-sum subsets the DP must examine). Beyond
# this the state space triples per person, so we fall back to greedy.
MAX_EXACT_PEOPLE = 14


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


def _settle_one_group(balances: dict[uuid.UUID, int]) -> list[Transfer]:
    """Greedy largest-debtor against largest-creditor.

    Each transfer zeroes at least one person, so a group of k needs at most k-1.
    When the caller has already split the group so that no proper subgroup sums
    to zero, k-1 is also the minimum, which makes this exactly optimal.
    """
    creditors = {user: amount for user, amount in balances.items() if amount > 0}
    debtors = {user: -amount for user, amount in balances.items() if amount < 0}

    transfers: list[Transfer] = []
    while debtors and creditors:
        # Iterating sorted ids makes ties deterministic.
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


def _largest_zero_sum_partition(
    people: list[uuid.UUID], amounts: list[int]
) -> list[list[uuid.UUID]]:
    """Split everyone into as many disjoint zero-sum subgroups as possible.

    Exact, via a DP over subsets. `best[mask]` is the most subgroups that `mask`
    can be carved into; since the whole set sums to zero and we only ever remove
    zero-sum subgroups, every remainder sums to zero too, so a full partition
    always exists (worst case: one subgroup containing everyone).
    """
    n = len(people)
    size = 1 << n

    totals = [0] * size
    for mask in range(1, size):
        low = mask & -mask
        totals[mask] = totals[mask ^ low] + amounts[low.bit_length() - 1]

    best = [-1] * size  # -1 means "cannot be partitioned"
    chosen = [0] * size  # the subgroup taken at this mask, for reconstruction
    best[0] = 0

    for mask in range(1, size):
        if totals[mask] != 0:
            continue
        # Anchor on the lowest set bit so each partition is generated once.
        low = mask & -mask
        rest = mask ^ low
        sub = rest
        while True:
            group = sub | low
            if totals[group] == 0 and best[mask ^ group] >= 0:
                candidate = 1 + best[mask ^ group]
                if candidate > best[mask]:
                    best[mask] = candidate
                    chosen[mask] = group
            if sub == 0:
                break
            sub = (sub - 1) & rest

    groups = []
    mask = size - 1
    while mask:
        group = chosen[mask]
        groups.append([people[i] for i in range(n) if group >> i & 1])
        mask ^= group
    return groups


def minimise_transfers(net_balances: dict[uuid.UUID, Decimal]) -> list[Transfer]:
    """Return the transfers that settle everyone up.

    A positive balance means the person is owed money; negative means they owe.
    People with a zero balance are left out entirely.

    The result is minimal for groups up to `MAX_EXACT_PEOPLE`; above that it is
    a good plan of at most n-1 transfers, but not provably the shortest.
    """
    cents = _to_cents(net_balances)
    active = {user: amount for user, amount in cents.items() if amount != 0}
    if not active:
        return []

    if len(active) > MAX_EXACT_PEOPLE:
        return _settle_one_group(active)

    # Sorting by id keeps the partition, and therefore the output, deterministic.
    people = sorted(active)
    amounts = [active[user] for user in people]

    transfers: list[Transfer] = []
    for group in _largest_zero_sum_partition(people, amounts):
        transfers.extend(_settle_one_group({user: active[user] for user in group}))
    return transfers
