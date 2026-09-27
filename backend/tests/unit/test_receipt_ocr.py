"""Turning what the model read into a draft a person can trust.

The model is an input, not a component: these tests are about what happens to
whatever it returns -- amounts parsed without floats, discounts kept out of the
lines, and anything unreadable surfaced rather than guessed.
"""

from datetime import date, timedelta
from decimal import Decimal
from typing import get_args

import pytest

from app.ai.receipt_ocr import (
    CategoryName,
    ExtractedLine,
    ExtractedReceipt,
    ScanWarning,
    build_draft,
    parse_amount,
)
from app.core.errors import BadRequestError
from app.models.enums import ExpenseCategory


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("12.90", Decimal("12.90")),
        ("12.9", Decimal("12.90")),
        ("7", Decimal("7.00")),
        ("₪ 12.90", Decimal("12.90")),
        ("1,234.50", Decimal("1234.50")),
        ("12,90", Decimal("12.90")),
        ("1,234", Decimal("1234.00")),
        ("-5.00", Decimal("-5.00")),
        ("5.00-", Decimal("-5.00")),  # how Israeli receipts often print a discount
        ("0.005", Decimal("0.01")),
    ],
)
def test_amounts_are_read_as_printed(text, expected):
    assert parse_amount(text) == expected


@pytest.mark.parametrize("text", [None, "", "abc", "..", "-"])
def test_things_that_are_not_amounts_are_none(text):
    assert parse_amount(text) is None


def extracted(**overrides) -> ExtractedReceipt:
    fields = {
        "is_receipt": True,
        "merchant": "שופרסל דיל",
        "date": "2026-09-20",
        "currency": "ILS",
        "total": "45.80",
        "category": "GROCERIES",
        "category_text": "סופרמרקט",
        "lines": [
            ExtractedLine(name="חלב 3%", amount="7.90"),
            ExtractedLine(name="לחם", amount="12.90"),
            ExtractedLine(name="גבינה", amount="25.00"),
        ],
    }
    fields.update(overrides)
    return ExtractedReceipt(**fields)


def test_a_clean_receipt_becomes_a_clean_draft():
    draft = build_draft(extracted(), group_currency="ILS")

    assert draft.merchant == "שופרסל דיל"
    assert draft.expense_date == date(2026, 9, 20)
    assert draft.total_amount == Decimal("45.80")
    assert draft.category is ExpenseCategory.GROCERIES
    assert [(line.name, line.amount) for line in draft.lines] == [
        ("חלב 3%", Decimal("7.90")),
        ("לחם", Decimal("12.90")),
        ("גבינה", Decimal("25.00")),
    ]
    assert draft.warnings == []


def test_a_discount_line_stays_in_the_total_not_in_the_lines():
    lines = [
        ExtractedLine(name="יין", amount="50.00"),
        ExtractedLine(name="הנחת מועדון", amount="-5.00"),
    ]
    draft = build_draft(extracted(lines=lines, total="45.00"), group_currency="ILS")
    assert [line.name for line in draft.lines] == ["יין"]
    assert draft.total_amount == Decimal("45.00")


def test_an_unreadable_line_is_dropped_and_flagged():
    lines = [ExtractedLine(name="לחם", amount="12.90"), ExtractedLine(name="???", amount="??")]
    draft = build_draft(extracted(lines=lines, total="20.00"), group_currency="ILS")
    assert [line.name for line in draft.lines] == ["לחם"]
    assert ScanWarning.LINES_UNREADABLE in draft.warnings


def test_a_missing_total_falls_back_to_the_lines_and_says_so():
    draft = build_draft(extracted(total=None), group_currency="ILS")
    assert draft.total_amount == Decimal("45.80")
    assert ScanWarning.TOTAL_MISSING in draft.warnings


def test_a_total_with_no_lines_is_still_a_draft():
    draft = build_draft(extracted(lines=[], total="80.00"), group_currency="ILS")
    assert draft.total_amount == Decimal("80.00")
    assert draft.lines == []
    assert ScanWarning.NO_ITEMS in draft.warnings


def test_nothing_readable_at_all_is_an_error():
    with pytest.raises(BadRequestError):
        build_draft(extracted(lines=[], total=None), group_currency="ILS")


def test_something_that_is_not_a_receipt_is_an_error():
    with pytest.raises(BadRequestError, match="receipt"):
        build_draft(extracted(is_receipt=False, lines=[]), group_currency="ILS")


@pytest.mark.parametrize("value", [None, "20/09/2026", "not a date"])
def test_an_unreadable_date_is_left_for_the_person(value):
    draft = build_draft(extracted(date=value), group_currency="ILS")
    assert draft.expense_date is None
    assert ScanWarning.DATE_MISSING in draft.warnings


def test_a_date_in_the_future_is_a_misread():
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    draft = build_draft(extracted(date=tomorrow), group_currency="ILS")
    assert draft.expense_date is None


def test_a_receipt_in_another_currency_is_flagged_not_converted():
    draft = build_draft(extracted(currency="eur"), group_currency="ILS")
    assert ScanWarning.CURRENCY_MISMATCH in draft.warnings
    assert draft.total_amount == Decimal("45.80")


def test_the_model_is_offered_exactly_the_real_categories():
    assert set(get_args(CategoryName)) == {c.value for c in ExpenseCategory}


def test_what_the_model_read_is_kept_for_ai_metadata():
    draft = build_draft(extracted(), group_currency="ILS")
    assert draft.metadata["ocr"]["category_text"] == "סופרמרקט"
    assert draft.metadata["ocr"]["lines_read"] == 3
