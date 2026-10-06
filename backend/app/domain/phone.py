"""Israeli mobile numbers (mission 7.3). Pure: text in, canonical text out.

A phone number is here for one reason -- paying someone with Bit or PayBox,
which only ever know a person by their *mobile* number. So a landline is
refused rather than stored: it would look like it worked and fail at the one
moment it is needed, with someone standing at the cash point.

Everything is stored as E.164 (`+972501234567`), whatever was typed. People
write the same number half a dozen ways, and two spellings of one number are
two numbers to anything that compares them.
"""

import re

#: What people put between digits. Removed before anything is checked.
_SEPARATORS = re.compile(r"[\s\-.()/]")

#: 05X followed by seven digits: every Israeli mobile prefix.
_NATIONAL_MOBILE = re.compile(r"05\d{8}")

#: 02/03/04/08/09 plus seven digits, or 07X plus seven digits.
_NATIONAL_LANDLINE = re.compile(r"0[234789]\d{7}|07\d{8}")


class InvalidPhoneNumber(ValueError):
    """The text is not an Israeli mobile number. The message is safe to show."""


def _national(digits: str) -> str:
    """The number as dialled inside Israel, from any of the usual spellings."""
    for prefix in ("+972", "00972", "972"):
        if digits.startswith(prefix):
            rest = digits.removeprefix(prefix)
            # "+972 050..." -- the trunk 0 kept after the country code is a
            # common slip, and unambiguous.
            return rest if rest.startswith("0") else "0" + rest
    return digits


def normalize_il_mobile(raw: str) -> str:
    """`050-123 4567`, `+972 50 1234567`, `972501234567` -> `+972501234567`.

    Raises `InvalidPhoneNumber` for anything that is not an Israeli mobile.
    """
    compact = _SEPARATORS.sub("", raw.strip())
    if not compact:
        raise InvalidPhoneNumber("Enter a phone number")
    if not re.fullmatch(r"\+?\d+", compact):
        raise InvalidPhoneNumber("A phone number can only contain digits")

    national = _national(compact)
    if _NATIONAL_MOBILE.fullmatch(national):
        return "+972" + national[1:]
    if _NATIONAL_LANDLINE.fullmatch(national):
        raise InvalidPhoneNumber("Bit and PayBox need a mobile number (05X)")
    raise InvalidPhoneNumber("Enter an Israeli mobile number, like 050-123-4567")
