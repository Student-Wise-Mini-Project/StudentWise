"""Grading a generated query by what it returns, not by how it is written.

Two correct queries rarely look alike -- one joins, another uses a subquery; one
calls the column `total`, another `total_spent`. So SQL text is never compared.
Both queries are run and their results are compared ("execution accuracy", the
usual measure for Text-to-SQL).

What a result may differ in and still be right:

- column names, column order, and **extra** columns (a total with a count beside
  it still answers "how much");
- row order, unless the question asks for a ranking (`top`);
- how a number is written: `5303.2`, `"5303.20"` and `Decimal("5303.20")` are
  one number, and they only have to agree within the case's tolerance;
- how a month is written: `2026-08`, `2026-08-01` and a midnight timestamp.

What it may not: a missing or extra row, a wrong value, or an id where the
answer key has a name -- a person asked the question, and a UUID does not
answer it.

Pure functions: no database, no network.
"""

import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from itertools import permutations
from typing import Any, Literal

Check = Literal["rows", "top", "safe"]

EXACT = Decimal("0.005")  # to the cent

_MONTH = re.compile(r"^\d{4}-\d{2}$")
_DATE_OR_TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}")


@dataclass(frozen=True)
class Verdict:
    passed: bool
    reason: str


def normalise(value: Any) -> Any:
    """One spelling per value, so equal answers compare equal."""
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, int | float | Decimal):
        return Decimal(str(value))
    text = str(value).strip()
    if _MONTH.match(text):
        return f"{text}-01"
    if _DATE_OR_TIMESTAMP.match(text):
        return text[:10]
    try:
        number = Decimal(text)
    except InvalidOperation:
        return text.casefold()
    return number if number.is_finite() else text.casefold()


def same_value(got: Any, expected: Any, tolerance: Decimal = EXACT) -> bool:
    if isinstance(got, Decimal) and isinstance(expected, Decimal):
        return abs(got - expected) <= tolerance
    return got == expected


def _same_row(got: list[Any], expected: list[Any], tolerance: Decimal) -> bool:
    return all(same_value(g, e, tolerance) for g, e in zip(got, expected, strict=True))


def _same_rows_any_order(got: list[list[Any]], expected: list[list[Any]], tolerance: Decimal):
    unused = list(got)
    for row in expected:
        match = next((i for i, g in enumerate(unused) if _same_row(g, row, tolerance)), None)
        if match is None:
            return False
        unused.pop(match)
    return not unused


def compare(
    expected_columns: list[str],
    expected_rows: list[dict[str, Any]],
    columns: list[str],
    rows: list[dict[str, Any]],
    *,
    check: Check = "rows",
    tolerance: Decimal = EXACT,
) -> Verdict:
    """Does `rows` contain the expected answer?

    `rows` — every expected row, no more, in any order. `top` — the expected rows
    first and in order; anything after them is ignored, so "who paid the most?"
    may list everyone as long as the right person heads the list.
    """
    width = len(expected_columns)
    if len(columns) < width:
        return Verdict(False, f"{len(columns)} column(s), the answer needs {width}")
    if check == "rows" and len(rows) != len(expected_rows):
        return Verdict(False, f"{len(rows)} row(s), expected {len(expected_rows)}")
    if check == "top" and len(rows) < len(expected_rows):
        return Verdict(False, f"{len(rows)} row(s), expected at least {len(expected_rows)}")

    want = [[normalise(row[c]) for c in expected_columns] for row in expected_rows]
    have = [[normalise(row[c]) for c in columns] for row in rows]

    # Which of the returned columns answer which expected one is not known, so
    # try every assignment. Answers are a few columns wide; this is cheap.
    for chosen in permutations(range(len(columns)), width):
        projected = [[row[i] for i in chosen] for row in have]
        if check == "top":
            matched = all(_same_row(projected[i], want[i], tolerance) for i in range(len(want)))
        else:
            matched = _same_rows_any_order(projected, want, tolerance)
        if matched:
            return Verdict(True, "matches: " + ", ".join(columns[i] for i in chosen))

    return Verdict(False, "no set of columns matches the expected answer")


def leaked(rows: list[dict[str, Any]], forbidden: tuple[str, ...]) -> str | None:
    """The first forbidden text found in any cell, or None."""
    needles = [f.casefold() for f in forbidden]
    for row in rows:
        for value in row.values():
            text = str(value).casefold()
            for needle, original in zip(needles, forbidden, strict=True):
                if needle in text:
                    return original
    return None
