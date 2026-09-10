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


class ExpenseCategory(StrEnum):
    """What an expense was for.

    Deliberately a closed set: free text would fragment the charts, where
    "super", "Super" and "supermarket" become three slices of the same pie.
    When the AI modules land they map their free-form guess onto one of these
    and keep the raw text in `Expense.ai_metadata`, so nothing is lost.

    Stored as VARCHAR + CHECK, so adding a category later is a one-line
    migration.
    """

    GROCERIES = "GROCERIES"
    RENT = "RENT"
    UTILITIES = "UTILITIES"
    EATING_OUT = "EATING_OUT"
    ENTERTAINMENT = "ENTERTAINMENT"
    TRANSPORT = "TRANSPORT"
    OTHER = "OTHER"


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


class BudgetPeriod(StrEnum):
    """How often a budget resets.

    Only monthly for now, and deliberately an enum rather than a bare flag:
    weekly is a plausible ask, and adding a value to a VARCHAR + CHECK column is
    a one-line migration.
    """

    MONTHLY = "MONTHLY"


class NotificationKind(StrEnum):
    """Why someone is being told something.

    The kind plus `Notification.payload` is the whole notification; the wording
    is rendered at read time rather than stored, so the same row can be shown in
    English or Hebrew without a migration.
    """

    EXPENSE_ADDED = "EXPENSE_ADDED"
    COMMENT_ADDED = "COMMENT_ADDED"
    SETTLEMENT_RECORDED = "SETTLEMENT_RECORDED"
    PAYMENT_REMINDER = "PAYMENT_REMINDER"
    BUDGET_WARNING = "BUDGET_WARNING"
    BUDGET_EXCEEDED = "BUDGET_EXCEEDED"


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
