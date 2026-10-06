"""Ranking vectors by cosine similarity with FAISS (mission 8.3)."""

import pytest

from app.domain.vector_search import from_bytes, rank, to_bytes


def test_the_closest_vector_comes_first():
    candidates = [[1, 0, 0], [0, 1, 0], [0.9, 0.1, 0]]
    hits = rank([1, 0, 0], candidates, limit=3)
    assert [h.index for h in hits] == [0, 2, 1]
    assert hits[0].score == pytest.approx(1.0)


def test_length_does_not_matter_only_direction():
    # A long text and a short one about the same thing must still match.
    hits = rank([1, 1, 0], [[10, 10, 0], [0, 0, 0.5]], limit=2)
    assert hits[0].index == 0
    assert hits[0].score == pytest.approx(1.0)


def test_a_zero_vector_matches_nothing_rather_than_crashing():
    hits = rank([1, 0], [[0, 0], [1, 0]], limit=2)
    assert [h.index for h in hits] == [1, 0]
    assert hits[1].score == 0


def test_asking_for_more_than_there_are_returns_them_all():
    assert len(rank([1, 0], [[1, 0], [0, 1]], limit=10)) == 2


def test_nothing_to_search_returns_nothing():
    assert rank([1, 0], [], limit=5) == []
    assert rank([1, 0], [[1, 0]], limit=0) == []


def test_vectors_of_different_models_are_refused():
    with pytest.raises(ValueError, match="dimensions"):
        rank([1, 0, 0], [[1, 0]], limit=1)


def test_a_vector_survives_the_database_round_trip():
    vector = [0.125, -1.5, 3.0, 0.0]
    assert from_bytes(to_bytes(vector)) == vector
    assert len(to_bytes(vector)) == 16  # float32
