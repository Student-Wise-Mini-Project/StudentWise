"""Enumerations shared across models.

All of these are stored as VARCHAR + CHECK constraint, never as native Postgres
ENUM types -- `ALTER TYPE ... ADD VALUE` is a migration headache and these enums
will grow (OCR/GMAIL_API sources in Step 3, more payment methods later).
Use `enum_column(SomeEnum)` when declaring the column.
"""

from enum import StrEnum

from sqlalchemy import Enum as SAEnum


class GroupType(StrEnum):
    SHARED_APARTMENT = "SHARED_APARTMENT"
    COUPLE = "COUPLE"
    SOLO = "SOLO"
    TRIP = "TRIP"


class MemberRole(StrEnum):
    OWNER = "OWNER"
    MEMBER = "MEMBER"


class SplitType(StrEnum):
    EQUAL = "EQUAL"
    EXACT = "EXACT"
    PERCENTAGE = "PERCENTAGE"
    WEIGHT = "WEIGHT"


class ExpenseSource(StrEnum):
    MANUAL = "MANUAL"
    VOICE = "VOICE"
    OCR = "OCR"
    GMAIL_API = "GMAIL_API"


class SettlementMethod(StrEnum):
    MANUAL = "MANUAL"
    BIT = "BIT"
    PAYBOX = "PAYBOX"


def enum_column(enum_cls: type[StrEnum]) -> SAEnum:
    """VARCHAR + CHECK constraint, with Python-side enum safety preserved."""
    return SAEnum(
        enum_cls,
        native_enum=False,
        # SQLAlchemy defaults this to False, which would give a bare VARCHAR with
        # nothing stopping a bad value at the database level.
        create_constraint=True,
        validate_strings=True,
        length=32,
        values_callable=lambda e: [member.value for member in e],
        name=f"{enum_cls.__name__.lower()}_check",
    )
