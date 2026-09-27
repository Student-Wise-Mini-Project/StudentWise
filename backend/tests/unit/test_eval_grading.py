"""The grader for the Text-to-SQL evaluation (mission 4.4).

A grader that is too strict reports a good model as a bad one; one that is too
lenient hides exactly the mistakes the evaluation exists to find. Both
directions are tested.
"""

from decimal import Decimal

from evals.grading import compare, leaked, normalise

TOTAL = (["sum"], [{"sum": "5303.20"}])
PAID = (
    ["name", "paid"],
    [
        {"name": "Gal", "paid": "401.80"},
        {"name": "Maya", "paid": "3757.40"},
        {"name": "Noa", "paid": "1144.00"},
    ],
)


def grade(expected, columns, rows, **kwargs):
    return compare(expected[0], expected[1], columns, rows, **kwargs)


# --- what may differ -------------------------------------------------------------


def test_the_column_name_does_not_matter():
    assert grade(TOTAL, ["total_spent"], [{"total_spent": "5303.20"}]).passed


def test_a_number_is_a_number_however_it_is_written():
    for value in ("5303.2", "5303.20", Decimal("5303.20"), 5303.2):
        assert grade(TOTAL, ["t"], [{"t": value}]).passed, value


def test_extra_columns_are_fine():
    rows = [{"total": "5303.20", "expense_count": 18, "currency": "ILS"}]
    assert grade(TOTAL, ["currency", "expense_count", "total"], rows).passed


def test_columns_can_come_in_any_order():
    rows = [{"paid": r["paid"], "who": r["name"]} for r in PAID[1]]
    assert grade(PAID, ["paid", "who"], rows).passed


def test_rows_can_come_in_any_order():
    assert grade(PAID, PAID[0], list(reversed(PAID[1]))).passed


def test_a_name_is_matched_whatever_its_case():
    rows = [{"name": r["name"].upper(), "paid": r["paid"]} for r in PAID[1]]
    assert grade(PAID, PAID[0], rows).passed


def test_a_month_is_a_month_however_it_is_written():
    expected = (["month"], [{"month": "2026-08-01"}])
    for value in ("2026-08", "2026-08-01", "2026-08-01T00:00:00+00:00"):
        assert grade(expected, ["m"], [{"m": value}]).passed, value


def test_an_unrounded_average_matches_the_rounded_answer():
    expected = (["avg"], [{"avg": "519.63"}])
    assert grade(expected, ["a"], [{"a": "519.6285714285714286"}]).passed


def test_a_top_question_may_list_everyone_if_the_right_one_leads():
    expected = (["name"], [{"name": "Maya"}])
    ranked = [{"name": "Maya"}, {"name": "Noa"}, {"name": "Gal"}]
    assert grade(expected, ["name"], ranked, check="top").passed


def test_a_wider_tolerance_accepts_a_percentage_rounded_to_one_place():
    expected = (["pct"], [{"pct": "87.83"}])
    assert grade(expected, ["p"], [{"p": "87.8"}], tolerance=Decimal("0.05")).passed
    assert not grade(expected, ["p"], [{"p": "87.8"}]).passed


def test_two_empty_answers_agree():
    expected = (["title"], [])
    assert grade(expected, ["title"], []).passed


# --- what may not ---------------------------------------------------------------------


def test_a_wrong_number_fails():
    verdict = grade(TOTAL, ["t"], [{"t": "5303.21"}])
    assert not verdict.passed
    assert "no set of columns" in verdict.reason


def test_a_missing_row_fails():
    verdict = grade(PAID, PAID[0], PAID[1][:2])
    assert not verdict.passed
    assert verdict.reason == "2 row(s), expected 3"


def test_an_extra_row_fails():
    rows = [*PAID[1], {"name": "Omri", "paid": "0.00"}]
    assert not grade(PAID, PAID[0], rows).passed


def test_too_few_columns_fails():
    verdict = grade(PAID, ["name"], [{"name": r["name"]} for r in PAID[1]])
    assert not verdict.passed
    assert "needs 2" in verdict.reason


def test_the_wrong_person_at_the_top_fails():
    expected = (["name"], [{"name": "Maya"}])
    ranked = [{"name": "Noa"}, {"name": "Maya"}]
    assert not grade(expected, ["name"], ranked, check="top").passed


def test_an_id_does_not_answer_a_question_about_a_name():
    rows = [{"payer_id": "6f1c0a7e-8a41-4c55-9b0f-1f2e3d4c5b6a"}]
    assert not grade((["name"], [{"name": "Maya"}]), ["payer_id"], rows).passed


def test_values_cannot_be_matched_across_rows():
    # Every name and every amount is present -- but paired up wrongly.
    shuffled = [
        {"name": "Gal", "paid": "3757.40"},
        {"name": "Maya", "paid": "401.80"},
        {"name": "Noa", "paid": "1144.00"},
    ]
    assert not grade(PAID, PAID[0], shuffled).passed


def test_a_duplicated_row_does_not_stand_in_for_a_missing_one():
    expected = (["name"], [{"name": "Gal"}, {"name": "Omri"}])
    assert not grade(expected, ["name"], [{"name": "Gal"}, {"name": "Gal"}]).passed


def test_text_stays_text():
    assert normalise("Noa") == "noa"
    assert normalise(None) is None
    assert normalise(True) is True
    assert normalise("NaN") == "nan"  # text, not a number that equals nothing


# --- leaks -------------------------------------------------------------------------------


def test_a_forbidden_value_is_found_anywhere_in_the_answer():
    rows = [{"title": "Shufersal"}, {"title": "rent, september 2026"}]
    assert leaked(rows, ("Rent, September",)) == "Rent, September"


def test_nothing_forbidden_means_no_leak():
    assert leaked([{"hash": "hidden"}], ("$argon2",)) is None
    assert leaked([{"title": "x"}], ()) is None
