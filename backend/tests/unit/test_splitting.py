"""Tests for the pure splitting arithmetic.

The invariant that matters everywhere else in the system: the computed splits sum
to exactly the expense total, to the cent, for every split type and every input.
"""

import uuid
from decimal import Decimal

import pytest

from app.core.errors import BadRequestError
from app.domain.splitting import ParticipantInput, compute_splits
from app.models.enums import SplitType


def ids(n: int) -> list[uuid.UUID]:
    """Deterministic, ascending user ids so tie-breaking is predictable."""
    return [uuid.UUID(int=i) for i in range(1, n + 1)]


def amounts(splits) -> list[Decimal]:
    return [s.owed_amount for s in splits]


def equal_participants(n: int) -> list[ParticipantInput]:
    return [ParticipantInput(user_id=u) for u in ids(n)]


# --- EQUAL ---------------------------------------------------------------


def test_equal_split_among_four_is_exact():
    splits = compute_splits(Decimal("100.00"), SplitType.EQUAL, equal_participants(4))
    assert amounts(splits) == [Decimal("25.00")] * 4


def test_equal_split_of_100_among_3_distributes_the_leftover_cent():
    splits = compute_splits(Decimal("100.00"), SplitType.EQUAL, equal_participants(3))
    assert amounts(splits) == [Decimal("33.34"), Decimal("33.33"), Decimal("33.33")]
    assert sum(amounts(splits)) == Decimal("100.00")


def test_equal_split_with_one_participant_gets_everything():
    splits = compute_splits(Decimal("87.65"), SplitType.EQUAL, equal_participants(1))
    assert amounts(splits) == [Decimal("87.65")]


def test_equal_split_of_a_single_cent_gives_the_rest_zero():
    splits = compute_splits(Decimal("0.01"), SplitType.EQUAL, equal_participants(3))
    assert sum(amounts(splits)) == Decimal("0.01")
    assert amounts(splits) == [Decimal("0.01"), Decimal("0.00"), Decimal("0.00")]


def test_equal_split_is_deterministic():
    first = compute_splits(Decimal("10.00"), SplitType.EQUAL, equal_participants(3))
    second = compute_splits(Decimal("10.00"), SplitType.EQUAL, equal_participants(3))
    assert amounts(first) == amounts(second)


@pytest.mark.parametrize("people", [1, 2, 3, 4, 5, 6, 7, 11])
def test_equal_split_always_sums_to_the_total(people: int):
    """The property that protects every balance in the system."""
    for cents in range(1, 401):
        total = Decimal(cents) / 100
        splits = compute_splits(total, SplitType.EQUAL, equal_participants(people))
        assert sum(amounts(splits)) == total, f"{total} among {people}"
        assert all(s.owed_amount >= 0 for s in splits)


# --- PERCENTAGE ----------------------------------------------------------


def test_percentage_split():
    a, b = ids(2)
    splits = compute_splits(
        Decimal("100.00"),
        SplitType.PERCENTAGE,
        [
            ParticipantInput(user_id=a, share_value=Decimal("60")),
            ParticipantInput(user_id=b, share_value=Decimal("40")),
        ],
    )
    assert amounts(splits) == [Decimal("60.00"), Decimal("40.00")]


def test_percentage_split_keeps_the_raw_share_value():
    a, b = ids(2)
    splits = compute_splits(
        Decimal("50.00"),
        SplitType.PERCENTAGE,
        [
            ParticipantInput(user_id=a, share_value=Decimal("70")),
            ParticipantInput(user_id=b, share_value=Decimal("30")),
        ],
    )
    assert [s.share_value for s in splits] == [Decimal("70"), Decimal("30")]


def test_percentage_split_rounds_to_exactly_the_total():
    a, b, c = ids(3)
    splits = compute_splits(
        Decimal("100.00"),
        SplitType.PERCENTAGE,
        [
            ParticipantInput(user_id=a, share_value=Decimal("33.33")),
            ParticipantInput(user_id=b, share_value=Decimal("33.33")),
            ParticipantInput(user_id=c, share_value=Decimal("33.34")),
        ],
    )
    assert sum(amounts(splits)) == Decimal("100.00")


def test_percentage_that_does_not_sum_to_100_is_rejected():
    a, b = ids(2)
    with pytest.raises(BadRequestError):
        compute_splits(
            Decimal("100.00"),
            SplitType.PERCENTAGE,
            [
                ParticipantInput(user_id=a, share_value=Decimal("60")),
                ParticipantInput(user_id=b, share_value=Decimal("30")),
            ],
        )


def test_percentage_requires_a_share_value():
    a, b = ids(2)
    with pytest.raises(BadRequestError):
        compute_splits(
            Decimal("100.00"),
            SplitType.PERCENTAGE,
            [ParticipantInput(user_id=a, share_value=Decimal("100")), ParticipantInput(user_id=b)],
        )


# --- WEIGHT --------------------------------------------------------------


def test_weight_split_is_proportional():
    a, b = ids(2)
    splits = compute_splits(
        Decimal("100.00"),
        SplitType.WEIGHT,
        [
            ParticipantInput(user_id=a, share_value=Decimal("1")),
            ParticipantInput(user_id=b, share_value=Decimal("3")),
        ],
    )
    assert amounts(splits) == [Decimal("25.00"), Decimal("75.00")]


def test_weight_split_handles_fractional_weights():
    a, b = ids(2)
    splits = compute_splits(
        Decimal("90.00"),
        SplitType.WEIGHT,
        [
            ParticipantInput(user_id=a, share_value=Decimal("0.6")),
            ParticipantInput(user_id=b, share_value=Decimal("0.4")),
        ],
    )
    assert amounts(splits) == [Decimal("54.00"), Decimal("36.00")]


def test_weight_requires_a_positive_share_value():
    a, b = ids(2)
    with pytest.raises(BadRequestError):
        compute_splits(
            Decimal("100.00"),
            SplitType.WEIGHT,
            [
                ParticipantInput(user_id=a, share_value=Decimal("0")),
                ParticipantInput(user_id=b, share_value=Decimal("1")),
            ],
        )


def test_weight_requires_share_values_to_be_supplied():
    """The service fills defaults from group_members; the pure function does not guess."""
    a, b = ids(2)
    with pytest.raises(BadRequestError):
        compute_splits(
            Decimal("100.00"),
            SplitType.WEIGHT,
            [ParticipantInput(user_id=a, share_value=Decimal("1")), ParticipantInput(user_id=b)],
        )


# --- EXACT ---------------------------------------------------------------


def test_exact_split_passes_the_amounts_through():
    a, b = ids(2)
    splits = compute_splits(
        Decimal("100.00"),
        SplitType.EXACT,
        [
            ParticipantInput(user_id=a, share_value=Decimal("70.50")),
            ParticipantInput(user_id=b, share_value=Decimal("29.50")),
        ],
    )
    assert amounts(splits) == [Decimal("70.50"), Decimal("29.50")]


def test_exact_split_that_misses_the_total_is_rejected():
    a, b = ids(2)
    with pytest.raises(BadRequestError):
        compute_splits(
            Decimal("100.00"),
            SplitType.EXACT,
            [
                ParticipantInput(user_id=a, share_value=Decimal("70.00")),
                ParticipantInput(user_id=b, share_value=Decimal("20.00")),
            ],
        )


def test_exact_split_rejects_a_negative_amount():
    a, b = ids(2)
    with pytest.raises(BadRequestError):
        compute_splits(
            Decimal("100.00"),
            SplitType.EXACT,
            [
                ParticipantInput(user_id=a, share_value=Decimal("110.00")),
                ParticipantInput(user_id=b, share_value=Decimal("-10.00")),
            ],
        )


def test_exact_split_rejects_sub_cent_precision():
    a, b = ids(2)
    with pytest.raises(BadRequestError):
        compute_splits(
            Decimal("100.00"),
            SplitType.EXACT,
            [
                ParticipantInput(user_id=a, share_value=Decimal("70.005")),
                ParticipantInput(user_id=b, share_value=Decimal("29.995")),
            ],
        )


# --- shared validation ---------------------------------------------------


def test_no_participants_is_rejected():
    with pytest.raises(BadRequestError):
        compute_splits(Decimal("100.00"), SplitType.EQUAL, [])


def test_duplicate_participants_are_rejected():
    a = ids(1)[0]
    with pytest.raises(BadRequestError):
        compute_splits(
            Decimal("100.00"),
            SplitType.EQUAL,
            [ParticipantInput(user_id=a), ParticipantInput(user_id=a)],
        )


@pytest.mark.parametrize("total", [Decimal("0.00"), Decimal("-5.00")])
def test_non_positive_total_is_rejected(total: Decimal):
    with pytest.raises(BadRequestError):
        compute_splits(total, SplitType.EQUAL, equal_participants(2))


def test_total_with_sub_cent_precision_is_rejected():
    with pytest.raises(BadRequestError):
        compute_splits(Decimal("10.005"), SplitType.EQUAL, equal_participants(2))


def test_results_come_back_sorted_by_user_id():
    a, b, c = ids(3)
    shuffled = [
        ParticipantInput(user_id=c),
        ParticipantInput(user_id=a),
        ParticipantInput(user_id=b),
    ]
    splits = compute_splits(Decimal("9.00"), SplitType.EQUAL, shuffled)
    assert [s.user_id for s in splits] == [a, b, c]
