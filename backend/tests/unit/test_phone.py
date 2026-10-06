"""Israeli mobile numbers: every usual spelling in, one canonical form out."""

import pytest

from app.domain.phone import InvalidPhoneNumber, normalize_il_mobile


@pytest.mark.parametrize(
    "typed",
    [
        "0501234567",
        "050-1234567",
        "050-123-4567",
        "050 123 4567",
        "(050) 123-4567",
        "050.123.4567",
        "+972501234567",
        "+972 50 123 4567",
        "+972-50-123-4567",
        "972501234567",
        "00972501234567",
        "+972 050 123 4567",  # the trunk 0 kept after the country code
        "  0501234567  ",
    ],
)
def test_every_usual_spelling_becomes_one_number(typed):
    assert normalize_il_mobile(typed) == "+972501234567"


@pytest.mark.parametrize("prefix", ["050", "051", "052", "053", "054", "055", "058", "059"])
def test_every_mobile_prefix_is_accepted(prefix):
    assert normalize_il_mobile(f"{prefix}7654321") == f"+972{prefix[1:]}7654321"


@pytest.mark.parametrize("landline", ["03-1234567", "02-6543210", "+972 3 123 4567", "077-1234567"])
def test_a_landline_is_refused_with_a_reason(landline):
    # Bit and PayBox only know people by their mobile number.
    with pytest.raises(InvalidPhoneNumber, match="mobile"):
        normalize_il_mobile(landline)


@pytest.mark.parametrize(
    "typed",
    [
        "050123456",  # a digit short
        "05012345678",  # a digit long
        "1501234567",
        "+1 415 555 0100",  # not Israeli
        "+44 7700 900123",
        "050-ABC-4567",
        "050*1234567",
        "+",
        "972",
    ],
)
def test_anything_else_is_refused(typed):
    with pytest.raises(InvalidPhoneNumber):
        normalize_il_mobile(typed)


def test_letters_say_so():
    with pytest.raises(InvalidPhoneNumber, match="digits"):
        normalize_il_mobile("call me")


def test_empty_is_refused():
    # The schema turns a cleared field into None before it gets here; the
    # domain function itself never accepts "nothing" as a number.
    with pytest.raises(InvalidPhoneNumber):
        normalize_il_mobile("   ")
