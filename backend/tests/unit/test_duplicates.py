"""Duplicate detection, tested where it lives: pure functions, no database.

The interesting tests here are the ones that must **not** fire. A detector that
flags January rent against February rent, or two different dinners in the same
week, is worse than no detector -- people stop reading it.
"""

from datetime import date
from decimal import Decimal

import pytest

from app.domain.duplicates import (
    Candidate,
    DuplicatePair,
    find_duplicates,
    normalise_title,
    title_similarity,
)


def candidate(key, amount, day, title="Electricity bill", payer="alice"):
    return Candidate(
        key=key,
        amount=Decimal(amount),
        when=date(2026, 9, day),
        title=title,
        payer_key=payer,
    )


def keys(pairs: list[DuplicatePair]) -> list[tuple]:
    return [(p.first_key, p.second_key) for p in pairs]


# --- normalising titles ---------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Electricity bill!!", "electricity bill"),
        ("electricity   bill", "electricity bill"),
        ("  ELECTRICITY, BILL  ", "electricity bill"),
        ("", ""),
    ],
)
def test_titles_are_normalised(raw, expected):
    assert normalise_title(raw) == expected


def test_two_spellings_of_the_same_bill_read_as_the_same(client=None):
    assert title_similarity("Electricity bill!!", "electricity   bill") == 1.0


def test_two_empty_titles_are_alike_and_one_empty_title_is_not():
    assert title_similarity("", "") == 1.0
    assert title_similarity("", "Rent") == 0.0


# --- the three things that actually happen --------------------------------


def test_two_people_paying_the_same_bill(client=None):
    pairs = find_duplicates(
        [
            candidate("a", "412.00", 3, payer="alice"),
            candidate("b", "412.00", 4, payer="bob"),
        ]
    )
    assert keys(pairs) == [("a", "b")]
    assert pairs[0].same_payer is False
    assert pairs[0].day_gap == 1
    assert any("two different people" in r.lower() for r in pairs[0].reasons)


def test_one_person_tapping_add_twice():
    pairs = find_duplicates(
        [
            candidate("a", "89.90", 3, title="Shufersal"),
            candidate("b", "89.90", 3, title="Shufersal"),
        ]
    )
    assert len(pairs) == 1
    assert pairs[0].same_payer is True
    assert pairs[0].day_gap == 0
    assert pairs[0].score == Decimal("1.00"), "same money, same words, same day"


def test_the_same_bill_under_a_slightly_different_name():
    pairs = find_duplicates(
        [
            candidate("a", "412.00", 3, title="Electricity bill"),
            candidate("b", "412.00", 5, title="Electricity"),
        ]
    )
    assert len(pairs) == 1
    assert any("almost the same" in r for r in pairs[0].reasons)


# --- what must never fire -------------------------------------------------


def test_a_monthly_bill_is_not_a_duplicate_of_itself():
    """The whole reason the window is three days and not thirty."""
    months = [
        Candidate(
            key=f"m{month}",
            amount=Decimal("412.00"),
            when=date(2026, month, 5),
            title="Electricity bill",
            payer_key="maya",
        )
        for month in range(1, 7)
    ]
    assert find_duplicates(months) == []


def test_different_amounts_are_different_payments():
    assert (
        find_duplicates(
            [
                candidate("a", "412.00", 3),
                candidate("b", "380.00", 3),
            ]
        )
        == []
    )


def test_the_same_amount_for_unrelated_things_is_not_flagged():
    """A 50.00 taxi and a 50.00 pizza on one evening are two payments."""
    assert (
        find_duplicates(
            [
                candidate("a", "50.00", 3, title="Taxi to the airport"),
                candidate("b", "50.00", 3, title="Pizza night"),
            ]
        )
        == []
    )


def test_a_pair_just_outside_the_window_is_left_alone():
    pairs = find_duplicates([candidate("a", "412.00", 1), candidate("b", "412.00", 5)])
    assert pairs == []
    # ... and just inside it is not.
    assert len(find_duplicates([candidate("a", "412.00", 1), candidate("b", "412.00", 4)])) == 1


def test_a_single_expense_cannot_duplicate_anything():
    assert find_duplicates([candidate("a", "412.00", 3)]) == []
    assert find_duplicates([]) == []


# --- scoring behaviour ----------------------------------------------------


def test_a_typo_in_the_amount_still_matches_but_scores_lower():
    exact = find_duplicates([candidate("a", "412.00", 3), candidate("b", "412.00", 3)])
    typo = find_duplicates([candidate("a", "412.00", 3), candidate("b", "410.00", 3)])
    assert len(typo) == 1
    assert typo[0].score < exact[0].score
    assert any("rounding error" in r for r in typo[0].reasons)


def test_a_wildly_different_amount_is_not_a_typo():
    assert find_duplicates([candidate("a", "412.00", 3), candidate("b", "200.00", 3)]) == []


def test_closer_in_time_scores_higher():
    same_day = find_duplicates([candidate("a", "412.00", 3), candidate("b", "412.00", 3)])
    three_days = find_duplicates([candidate("a", "412.00", 3), candidate("b", "412.00", 6)])
    assert same_day[0].score > three_days[0].score


def test_results_come_back_likeliest_first():
    pairs = find_duplicates(
        [
            candidate("a", "412.00", 1, title="Electricity bill"),
            candidate("b", "412.00", 3, title="Electric"),
            candidate("c", "99.00", 10, title="Water bill"),
            candidate("d", "99.00", 10, title="Water bill"),
        ]
    )
    scores = [p.score for p in pairs]
    assert scores == sorted(scores, reverse=True)
    assert keys(pairs)[0] == ("c", "d")


def test_three_identical_entries_report_every_pair():
    """Somebody tapped Add three times. All three pairings are real."""
    pairs = find_duplicates(
        [
            candidate("a", "50.00", 3, title="Beer"),
            candidate("b", "50.00", 3, title="Beer"),
            candidate("c", "50.00", 3, title="Beer"),
        ]
    )
    assert len(pairs) == 3
    assert set(keys(pairs)) == {("a", "b"), ("a", "c"), ("b", "c")}


def test_the_window_can_be_widened_and_narrowed():
    both = [candidate("a", "412.00", 1), candidate("b", "412.00", 8)]
    assert find_duplicates(both) == []
    assert len(find_duplicates(both, window_days=10)) == 1
    assert find_duplicates(both, window_days=0) == []


def test_a_negative_window_is_a_programming_error():
    with pytest.raises(ValueError, match="window_days"):
        find_duplicates([], window_days=-1)


def test_raising_the_threshold_keeps_only_the_confident_ones():
    entries = [
        candidate("a", "412.00", 3, title="Electricity bill"),
        candidate("b", "412.00", 5, title="Electricity bill"),
    ]
    assert len(find_duplicates(entries)) == 1
    assert find_duplicates(entries, min_score=Decimal("0.95")) == []


def test_weak_on_all_three_counts_is_not_reported():
    """Where the default threshold actually sits.

    A near-but-not-equal amount (0.30), a title that only half matches (0.20)
    and the far edge of the window (0.05) add up to 0.55 -- under the 0.60 floor.
    Any two of the three being strong is enough; none of them being strong is
    not, and that is the line worth holding.
    """
    entries = [
        candidate("a", "412.00", 3, title="Electricity bill"),
        candidate("b", "410.00", 6, title="Electric"),
    ]
    assert find_duplicates(entries) == []
    assert len(find_duplicates(entries, min_score=Decimal("0.50"))) == 1

    # Make any single one of the three strong and it clears the bar.
    same_amount = [
        candidate("a", "412.00", 3, title="Electricity bill"),
        candidate("b", "412.00", 6, title="Electric"),
    ]
    assert len(find_duplicates(same_amount)) == 1


def test_ordering_of_the_input_does_not_change_the_answer():
    entries = [
        candidate("a", "412.00", 3),
        candidate("b", "412.00", 4),
        candidate("c", "99.00", 3, title="Water"),
    ]
    assert find_duplicates(entries) == find_duplicates(list(reversed(entries)))


def test_the_earlier_expense_is_always_named_first():
    pairs = find_duplicates([candidate("later", "412.00", 5), candidate("earlier", "412.00", 3)])
    assert keys(pairs) == [("earlier", "later")]


def test_a_zero_amount_pair_does_not_divide_by_zero():
    """Totals must be positive at the API, but the domain should not explode."""
    pairs = find_duplicates(
        [
            Candidate(
                key="a", amount=Decimal("0"), when=date(2026, 9, 3), title="X", payer_key="p"
            ),
            Candidate(
                key="b", amount=Decimal("0"), when=date(2026, 9, 3), title="X", payer_key="p"
            ),
        ]
    )
    assert len(pairs) == 1
