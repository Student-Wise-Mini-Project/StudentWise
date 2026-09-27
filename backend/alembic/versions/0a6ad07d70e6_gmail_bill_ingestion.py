"""gmail bill ingestion

Missions 5.8-5.10: connecting Gmail, and bills read from it.

`gmail_connections` holds one encrypted refresh token per user. Its own table
rather than a `users` column: a credential that can read a whole mailbox has
its own lifecycle, and the users row is read on every request.

`ingested_bills` is one row per email looked at. It is deliberately not a
status on `expenses`: every query that adds up money reads that table, and an
unapproved bill must never reach one of them. A bill becomes an ordinary
expense only once its flat is decided. The (user, message) unique constraint
is what makes a sync safe to run twice.

`groups.address` is what a bill's service address is matched against, for
someone who lives in more than one flat.

The enum CHECK constraints come from the `Enum(create_constraint=True)`
columns. Autogenerate also emitted each of them a second time as an explicit
CheckConstraint with the same name, which Postgres refuses; those duplicates
were removed.

Revision ID: 0a6ad07d70e6
Revises: 026e0e97e0b1
Create Date: 2026-09-27 17:05:22.549369

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0a6ad07d70e6"
down_revision: Union[str, Sequence[str], None] = "026e0e97e0b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _enum(*values: str, name: str) -> sa.Enum:
    return sa.Enum(*values, name=name, native_enum=False, create_constraint=True, length=32)


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "gmail_connections",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("google_email", sa.String(length=255), nullable=False),
        sa.Column("refresh_token_encrypted", sa.Text(), nullable=False),
        sa.Column(
            "connected_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("clock_timestamp()"),
            nullable=False,
        ),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("needs_reconnect", sa.Boolean(), server_default="false", nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_table(
        "ingested_bills",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("gmail_message_id", sa.String(length=64), nullable=False),
        sa.Column(
            "status",
            _enum(
                "IMPORTED",
                "PENDING_REVIEW",
                "APPROVED",
                "DISMISSED",
                "SKIPPED",
                name="ingestedbillstatus_check",
            ),
            nullable=False,
        ),
        sa.Column(
            "review_reason",
            _enum(
                "NOT_A_BILL",
                "UNREADABLE",
                "NO_AMOUNT",
                "NO_FLAT",
                "AMBIGUOUS_FLAT",
                "UNKNOWN_SENDER",
                "RECURRING_CONFLICT",
                "CURRENCY_MISMATCH",
                "DUPLICATE",
                name="billreviewreason_check",
            ),
            nullable=True,
        ),
        sa.Column("sender", sa.String(length=320), nullable=True),
        sa.Column("subject", sa.String(length=500), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("provider_name", sa.String(length=200), nullable=True),
        sa.Column("total_amount", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("billed_to_name", sa.String(length=200), nullable=True),
        sa.Column("service_address", sa.String(length=300), nullable=True),
        sa.Column("invoice_number", sa.String(length=100), nullable=True),
        sa.Column(
            "category",
            _enum(
                "GROCERIES",
                "RENT",
                "UTILITIES",
                "EATING_OUT",
                "ENTERTAINMENT",
                "TRANSPORT",
                "OTHER",
                name="expensecategory_check",
            ),
            nullable=True,
        ),
        sa.Column("group_id", sa.Uuid(), nullable=True),
        sa.Column("address_score", sa.Integer(), nullable=True),
        sa.Column("expense_id", sa.Uuid(), nullable=True),
        sa.Column("ai_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("clock_timestamp()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["expense_id"], ["expenses.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["group_id"], ["groups.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "gmail_message_id", name="uq_ingested_bills_user_message"),
    )
    op.create_index(
        "ix_ingested_bills_user_status", "ingested_bills", ["user_id", "status"], unique=False
    )
    op.add_column("groups", sa.Column("address", sa.String(length=300), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("groups", "address")
    op.drop_index("ix_ingested_bills_user_status", table_name="ingested_bills")
    op.drop_table("ingested_bills")
    op.drop_table("gmail_connections")
