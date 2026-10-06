"""expense embeddings

Mission 8.3: one embedding per expense, for semantic search in the chat
("that Italian place in October").

A table of its own rather than a column on `expenses`: it is derived, large,
and replaced wholesale when the embedding model changes. Rows are written at
search time, never when an expense is saved, so saving an expense never
depends on a third-party API. They cascade with their expense.

The vectors live here, in Postgres, and nowhere else: the search builds its
FAISS index in memory from these rows on each query, so there is no index
file to lose when a container restarts.

Revision ID: 8564366d2686
Revises: 7bd0ad0e9592
Create Date: 2026-10-06 11:07:30.855372

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8564366d2686"
down_revision: str | Sequence[str] | None = "7bd0ad0e9592"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "expense_embeddings",
        sa.Column("expense_id", sa.Uuid(), nullable=False),
        sa.Column("model", sa.String(length=64), nullable=False),
        sa.Column("text_hash", sa.String(length=64), nullable=False),
        sa.Column("dimensions", sa.Integer(), nullable=False),
        sa.Column("vector", sa.LargeBinary(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("clock_timestamp()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["expense_id"], ["expenses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("expense_id"),
    )


def downgrade() -> None:
    op.drop_table("expense_embeddings")
