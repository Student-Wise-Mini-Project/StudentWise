"""Tests for anomaly detection on a series of amounts.

What we want: catch "the water bill doubled" without crying wolf every time the
grocery shop is a bit bigger than usual. That means the threshold has to adapt
to how much a series normally moves around.
"""

from decimal import Decimal

import pytest

from app.domain.anomalies import AnomalyDirection, find_anomalies


def series(*values: str) -> list[Decimal]:
    return [Decimal(v) for v in values]


def flagged_indices(values, **kwargs) -> list[int]:
    return [a.index for a in find_anomalies(values, **kwargs)]


# --- not enough history --------------------------------------------------


def test_empty_series():
    assert find_anomalies([]) == []


def test_a_series_too_short_to_judge():
    """With almost no history, everything looks unusual -- so say nothing."""
    assert find_anomalies(series("100", "500")) == []


def test_series_exactly_at_the_minimum_is_still_silent():
    # min_history=4 means 4 other observations are needed to judge one.
    assert find_anomalies(series("100", "100", "100", "100")) == []


def test_one_more_observation_makes_it_judgeable():
    assert flagged_indices(series("100", "100", "100", "100", "500")) == [4]


# --- the core case -------------------------------------------------------


def test_a_spike_in_a_steady_bill_is_flagged():
    electricity = series("400", "412", "395", "408", "820")
    anomalies = find_anomalies(electricity)
    assert len(anomalies) == 1
    assert anomalies[0].index == 4
    assert anomalies[0].direction is AnomalyDirection.HIGH


def test_the_baseline_is_the_rest_of_the_series_not_the_whole():
    """Leave-one-out. If a spike were included in its own baseline it would drag
    the median toward itself and hide."""
    anomalies = find_anomalies(series("400", "400", "400", "400", "800"))
    assert anomalies[0].baseline == Decimal("400")


def test_a_huge_outlier_does_not_mask_itself():
    """Including the outlier in the dispersion estimate is the classic masking
    bug: one enormous value inflates the spread until nothing looks unusual."""
    assert flagged_indices(series("50", "50", "50", "50", "50", "100000")) == [5]


def test_difference_and_percent_change_are_reported():
    anomalies = find_anomalies(series("400", "400", "400", "400", "600"))
    found = anomalies[0]
    assert found.baseline == Decimal("400")
    assert found.difference == Decimal("200")
    assert found.percent_change == Decimal("50.0")


def test_a_drop_is_flagged_as_low():
    anomalies = find_anomalies(series("400", "410", "395", "405", "40"))
    assert anomalies[0].direction is AnomalyDirection.LOW
    assert anomalies[0].percent_change < 0


def test_several_anomalies_come_back_worst_first():
    anomalies = find_anomalies(series("100", "100", "100", "100", "100", "400", "900"))
    assert [a.index for a in anomalies] == [6, 5]
    assert anomalies[0].score >= anomalies[1].score


# --- not crying wolf -----------------------------------------------------


def test_a_naturally_variable_series_is_left_alone():
    """Groceries swing around by design; that is not an anomaly."""
    groceries = series("210", "340", "180", "420", "260", "390", "300")
    assert find_anomalies(groceries) == []


def test_a_steady_series_has_no_anomalies():
    assert find_anomalies(series("100", "100", "100", "100", "100", "100")) == []


def test_a_tiny_change_against_an_identical_history_is_not_an_anomaly():
    """Rent of exactly 3000 four times has zero spread, so any change is
    infinitely many deviations. Without a relative floor, 3000 -> 3010 would be
    reported, which is noise."""
    assert find_anomalies(series("3000", "3000", "3000", "3000", "3010")) == []


def test_a_real_jump_against_an_identical_history_is_an_anomaly():
    anomalies = find_anomalies(series("3000", "3000", "3000", "3000", "4500"))
    assert len(anomalies) == 1
    assert anomalies[0].baseline == Decimal("3000")
    assert anomalies[0].percent_change == Decimal("50.0")


def test_the_relative_floor_is_configurable():
    values = series("400", "400", "400", "400", "460")  # +15%
    assert find_anomalies(values, min_relative_change=Decimal("0.30")) == []
    assert len(find_anomalies(values, min_relative_change=Decimal("0.10"))) == 1


def test_a_higher_threshold_reports_less():
    values = series("400", "412", "395", "408", "820")
    assert len(find_anomalies(values, threshold=Decimal("3.5"))) == 1
    assert find_anomalies(values, threshold=Decimal("500")) == []


# --- robustness ----------------------------------------------------------


def test_zeros_in_the_series_do_not_divide_by_zero():
    assert find_anomalies(series("0", "0", "0", "0", "500")) is not None


def test_a_zero_baseline_is_handled():
    anomalies = find_anomalies(series("0", "0", "0", "0", "0", "700"))
    assert all(a.percent_change is not None for a in anomalies)


def test_results_are_deterministic():
    values = series("100", "100", "100", "100", "450")
    first = find_anomalies(values)
    second = find_anomalies(values)
    assert [(a.index, a.score) for a in first] == [(a.index, a.score) for a in second]


def test_order_of_the_series_does_not_change_which_values_are_flagged():
    """The statistic is order-independent; only the reported index moves."""
    forward = find_anomalies(series("100", "100", "100", "100", "900"))
    backward = find_anomalies(series("900", "100", "100", "100", "100"))
    assert forward[0].amount == backward[0].amount == Decimal("900")


def test_min_history_is_configurable():
    values = series("100", "100", "100", "500")
    assert find_anomalies(values) == []
    assert len(find_anomalies(values, min_history=3)) == 1


@pytest.mark.parametrize("size", [5, 8, 20, 50])
def test_a_flat_series_of_any_length_is_quiet(size: int):
    assert find_anomalies([Decimal("250")] * size) == []
