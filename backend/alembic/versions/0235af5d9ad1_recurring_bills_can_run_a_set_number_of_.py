"""recurring bills can run a set number of times

"Twelve months of rent" is a real agreement. Until now every schedule ran
forever and the only way to end one was to remember to delete it.

`occurrences_total` NULL means forever, so every existing bill is unchanged.

**`occurrences_done` is backfilled from the expenses each bill already posted**,
not left at zero. A bill that has already run three times and is then given a
total of 12 must have nine left, not twelve -- starting everyone at zero would
silently hand out extra months to exactly the bills that have been running
longest.

The CHECK constraint is written out by hand because **autogenerate does not
emit CheckConstraint**, the same trap this project hit with the VARCHAR enum
constraints in 453f7823ac5b: the model grows a rule, the migration says
nothing, and the database goes on accepting what the model forbids.

Revision ID: 0235af5d9ad1
Revises: 5b34b813909d
Create Date: 2026-09-12 16:16:55.010638

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0235af5d9ad1"
down_revision: Union[str, Sequence[str], None] = "5b34b813909d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("recurring_bills", sa.Column("occurrences_total", sa.Integer(), nullable=True))
    op.add_column(
        "recurring_bills",
        sa.Column("occurrences_done", sa.Integer(), server_default="0", nullable=False),
    )

    # What each bill has already posted. `expenses.recurring_bill_id` is the
    # only record of it, and it is exactly what the counter means.
    op.execute(
        """
        UPDATE recurring_bills AS b
           SET occurrences_done = (
                 SELECT count(*) FROM expenses AS e WHERE e.recurring_bill_id = b.id
               )
        """
    )

    op.create_check_constraint(
        "ck_recurring_bills_occurrences_total",
        "recurring_bills",
        "occurrences_total IS NULL OR occurrences_total > 0",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("ck_recurring_bills_occurrences_total", "recurring_bills", type_="check")
    op.drop_column("recurring_bills", "occurrences_done")
    op.drop_column("recurring_bills", "occurrences_total")
