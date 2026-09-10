"""Tests for the min-cash-flow algorithm.

Two invariants matter:
  1. Applying the suggested transfers must bring every balance to zero.
  2. The number of transfers must never exceed (number of people with a
     non-zero balance) - 1.
"""

import uuid
from decimal import Decimal

import pytest

from app.core.errors import BadRequestError
from app.domain.settlement_algo import minimise_transfers


def ids(n: int) -> list[uuid.UUID]:
    return [uuid.UUID(int=i) for i in range(1, n + 1)]


def apply(nets: dict[uuid.UUID, Decimal], transfers) -> dict[uuid.UUID, Decimal]:
    """Settle up: a payer's negative balance rises, a recipient's falls."""
    result = dict(nets)
    for transfer in transfers:
        result[transfer.from_user_id] += transfer.amount
        result[transfer.to_user_id] -= transfer.amount
    return result


def check_settles(nets: dict[uuid.UUID, Decimal]):
    transfers = minimise_transfers(nets)
    settled = apply(nets, transfers)
    assert all(v == 0 for v in settled.values()), settled
    non_zero = sum(1 for v in nets.values() if v != 0)
    assert len(transfers) <= max(non_zero - 1, 0)
    assert all(t.amount > 0 for t in transfers)
    return transfers


def test_nobody_owes_anything():
    a, b = ids(2)
    assert minimise_transfers({a: Decimal("0.00"), b: Decimal("0.00")}) == []


def test_empty_group():
    assert minimise_transfers({}) == []


def test_simple_two_person_debt():
    a, b = ids(2)
    transfers = check_settles({a: Decimal("50.00"), b: Decimal("-50.00")})
    assert len(transfers) == 1
    assert transfers[0].from_user_id == b
    assert transfers[0].to_user_id == a
    assert transfers[0].amount == Decimal("50.00")


def test_one_creditor_two_debtors_needs_two_transfers():
    a, b, c = ids(3)
    transfers = check_settles({a: Decimal("60.00"), b: Decimal("-30.00"), c: Decimal("-30.00")})
    assert len(transfers) == 2


def test_three_way_circle_collapses_to_two_transfers():
    """The point of the algorithm: A owes B, B owes C, C owes A nets down."""
    a, b, c = ids(3)
    transfers = check_settles({a: Decimal("-10.00"), b: Decimal("0.00"), c: Decimal("10.00")})
    assert len(transfers) == 1


def test_exact_matches_are_paired_off():
    """Four people, two clean pairs -- should be two transfers, not three."""
    a, b, c, d = ids(4)
    transfers = check_settles(
        {
            a: Decimal("25.00"),
            b: Decimal("-25.00"),
            c: Decimal("40.00"),
            d: Decimal("-40.00"),
        }
    )
    assert len(transfers) == 2


def test_people_with_zero_balance_are_left_out():
    a, b, c = ids(3)
    transfers = check_settles({a: Decimal("15.00"), b: Decimal("-15.00"), c: Decimal("0.00")})
    assert all(c not in (t.from_user_id, t.to_user_id) for t in transfers)


def test_awkward_cents_still_settle_exactly():
    a, b, c = ids(3)
    check_settles({a: Decimal("33.34"), b: Decimal("-16.67"), c: Decimal("-16.67")})


def test_larger_group():
    people = ids(7)
    nets = {
        people[0]: Decimal("120.55"),
        people[1]: Decimal("-45.20"),
        people[2]: Decimal("13.00"),
        people[3]: Decimal("-88.35"),
        people[4]: Decimal("0.00"),
        people[5]: Decimal("31.40"),
        people[6]: Decimal("-31.40"),
    }
    check_settles(nets)


def test_result_is_deterministic():
    a, b, c = ids(3)
    nets = {a: Decimal("60.00"), b: Decimal("-30.00"), c: Decimal("-30.00")}
    first = minimise_transfers(nets)
    second = minimise_transfers(nets)
    assert [(t.from_user_id, t.to_user_id, t.amount) for t in first] == [
        (t.from_user_id, t.to_user_id, t.amount) for t in second
    ]


def test_balances_that_do_not_sum_to_zero_are_rejected():
    """A non-zero sum means the balance calculation is broken -- fail loudly."""
    a, b = ids(2)
    with pytest.raises(BadRequestError):
        minimise_transfers({a: Decimal("50.00"), b: Decimal("-40.00")})


def test_sub_cent_balances_are_rejected():
    a, b = ids(2)
    with pytest.raises(BadRequestError):
        minimise_transfers({a: Decimal("50.005"), b: Decimal("-50.005")})


@pytest.mark.parametrize("seed", range(30))
def test_random_balances_always_settle(seed: int):
    """Property test: whatever the balances, applying the plan zeroes everyone."""
    import random

    rng = random.Random(seed)
    people = ids(rng.randint(2, 8))
    raw = [Decimal(rng.randint(-5000, 5000)) / 100 for _ in people[:-1]]
    # The last person absorbs the remainder so the group nets to zero.
    raw.append(-sum(raw))
    check_settles(dict(zip(people, raw, strict=True)))
