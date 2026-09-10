"""expense category enum

Turns `expenses.category` from free text into a closed set. Free text fragments
the analytics charts -- "super", "Super" and "supermarket" become three slices
of the same pie -- so the column becomes VARCHAR + CHECK.

Existing free-text values are mapped onto the new set first; anything we do not
recognise becomes OTHER rather than being thrown away. NULL is left alone: it
means "nobody said", which analytics folds in with OTHER for display.

Revision ID: 0a16607a0426
Revises: c65b6bcc85e3
Create Date: 2026-09-10

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0a16607a0426"
down_revision: str | Sequence[str] | None = "c65b6bcc85e3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

VALUES = (
    "GROCERIES",
    "RENT",
    "UTILITIES",
    "EATING_OUT",
    "ENTERTAINMENT",
    "TRANSPORT",
    "OTHER",
)

CONSTRAINT = "expensecategory_check"

# Best-effort mapping of the free text that existed before this migration.
LEGACY = {
    "super": "GROCERIES",
    "supermarket": "GROCERIES",
    "groceries": "GROCERIES",
    "bills": "UTILITIES",
    "utilities": "UTILITIES",
    "electricity": "UTILITIES",
    "water": "UTILITIES",
    "gas": "UTILITIES",
    "rent": "RENT",
    "fun": "ENTERTAINMENT",
    "entertainment": "ENTERTAINMENT",
    "restaurant": "EATING_OUT",
    "food": "EATING_OUT",
    "transport": "TRANSPORT",
    "home": "OTHER",
}

NEW_TYPE = sa.Enum(*VALUES, name=CONSTRAINT, native_enum=False, length=32)
OLD_TYPE = sa.VARCHAR(length=64)


def upgrade() -> None:
    # 1. Normalise what is already there, before any constraint can reject it.
    for legacy, replacement in LEGACY.items():
        op.execute(
            sa.text("UPDATE expenses SET category = :new WHERE lower(category) = :old").bindparams(
                new=replacement, old=legacy
            )
        )

    # 2. Anything still unrecognised becomes OTHER. NULL stays NULL.
    op.execute(
        sa.text(
            "UPDATE expenses SET category = 'OTHER' "
            "WHERE category IS NOT NULL AND category NOT IN :allowed"
        ).bindparams(sa.bindparam("allowed", value=VALUES, expanding=True))
    )

    # 3. Narrow the column, then add the CHECK explicitly -- alter_column alone
    #    does not create it, which would leave a bare VARCHAR behind.
    op.alter_column(
        "expenses",
        "category",
        existing_type=OLD_TYPE,
        type_=NEW_TYPE,
        existing_nullable=True,
    )
    op.create_check_constraint(
        CONSTRAINT,
        "expenses",
        sa.column("category").in_(VALUES),
    )


def downgrade() -> None:
    op.drop_constraint(CONSTRAINT, "expenses", type_="check")
    op.alter_column(
        "expenses",
        "category",
        existing_type=NEW_TYPE,
        type_=OLD_TYPE,
        existing_nullable=True,
    )
