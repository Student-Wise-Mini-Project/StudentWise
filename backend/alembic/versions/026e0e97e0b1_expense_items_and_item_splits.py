"""expense items and item splits

Receipt lines, and who shared each one (mission 5.1).

These tables record how a split was worked out, never the split itself: the
amounts are still written to `expense_splits`, so nothing that reads money
changes. Both cascade from the expense, which is hard-deleted as ever.

`amount > 0` is a CHECK because a discount belongs to the whole receipt, not to
whoever happened to be on the discount line -- it is the gap between the lines
and the total, and is spread across everyone.

Revision ID: 026e0e97e0b1
Revises: 0235af5d9ad1
Create Date: 2026-09-27 15:11:16.317801

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "026e0e97e0b1"
down_revision: Union[str, Sequence[str], None] = "0235af5d9ad1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "expense_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("expense_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_expense_items_amount_positive"),
        sa.ForeignKeyConstraint(["expense_id"], ["expenses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("expense_id", "position", name="uq_expense_items_expense_position"),
    )
    op.create_table(
        "item_splits",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("item_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["expense_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("item_id", "user_id", name="uq_item_splits_item_user"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("item_splits")
    op.drop_table("expense_items")
