"""Matching the address on a bill to a flat.

The failure that matters is a confident wrong answer: a bill split among the
wrong flatmates. So most of these are about refusing.
"""

import uuid

import pytest

from app.domain.address_matching import address_score, best_flat, normalise

A, B, C = (uuid.UUID(int=i) for i in (1, 2, 3))
MATCH = {"threshold": 85, "margin": 10}


def test_normalise_drops_address_words_and_keeps_house_numbers():
    n = normalise("רח' דיזנגוף 5, דירה 3, תל-אביב")
    assert n.numbers == {"5", "3"}
    assert "דיזנגוף" in n.words
    assert "דירה" not in n.words
    assert "רח" not in n.words


@pytest.mark.parametrize(
    ("bill", "flat"),
    [
        ("דיזנגוף 5 תל אביב", "דיזנגוף 5"),
        ("רחוב דיזנגוף 5, דירה 3, תל אביב-יפו", "דיזנגוף 5 תל אביב"),
        ('שד" רוטשילד 12', "שד רוטשילד 12"),
        ("Dizengoff St. 5, Apt 3, Tel Aviv", "dizengoff 5 tel aviv"),
    ],
)
def test_the_same_place_written_differently_scores_high(bill, flat):
    assert address_score(bill, flat) >= 85


def test_a_different_house_number_is_zero_however_similar_the_words():
    assert address_score("דיזנגוף 50 תל אביב", "דיזנגוף 5 תל אביב") == 0
    assert address_score("דיזנגוף 5", "דיזנגוף 15") == 0


def test_an_extra_apartment_number_on_the_bill_is_fine():
    assert address_score("דיזנגוף 5 דירה 7", "דיזנגוף 5") == 100


def test_a_different_street_scores_low():
    assert address_score("אבן גבירול 5", "דיזנגוף 5") < 60


def test_empty_addresses_score_zero():
    assert address_score("", "דיזנגוף 5") == 0
    assert address_score("דיזנגוף 5", "  ") == 0


def test_the_flat_whose_address_matches_is_chosen():
    match = best_flat(
        "דיזנגוף 5 דירה 3 תל אביב",
        [(A, "דיזנגוף 5 תל אביב"), (B, "פלורנטין 22 תל אביב")],
        **MATCH,
    )
    assert match.group_id == A
    assert match.score >= 85


def test_two_flats_that_match_equally_are_not_guessed_between():
    match = best_flat(
        "הרצל 10",
        [(A, "הרצל 10 חיפה"), (B, "הרצל 10 תל אביב")],
        **MATCH,
    )
    assert match.group_id is None
    assert match.best_guess in {A, B}


def test_a_weak_best_match_is_only_a_suggestion():
    match = best_flat("דיזנגופ 5", [(A, "דיזנגוף סנטר 5 תל אביב")], threshold=99, margin=0)
    assert match.group_id is None
    assert match.best_guess == A


def test_no_bill_address_means_no_match():
    assert best_flat(None, [(A, "דיזנגוף 5")], **MATCH).group_id is None


def test_flats_without_an_address_are_ignored():
    match = best_flat("דיזנגוף 5", [(A, None), (B, "דיזנגוף 5"), (C, "")], **MATCH)
    assert match.group_id == B
