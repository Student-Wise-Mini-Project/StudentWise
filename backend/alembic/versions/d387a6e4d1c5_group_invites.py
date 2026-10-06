"""group invites

Invite links: a member shares a link (WhatsApp, email, copy), and whoever opens
it joins the group -- the way in for someone with no account yet, whom the
group cannot add by email.

The token is unique and random; a link expires after 14 days and can be
replaced, which revokes the old one. Both cascade from their group, so deleting
a group leaves no working links behind.

Revision ID: d387a6e4d1c5
Revises: 8564366d2686
Create Date: 2026-10-06 20:14:52.104693

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d387a6e4d1c5"
down_revision: str | Sequence[str] | None = "8564366d2686"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "group_invites",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("group_id", sa.Uuid(), nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("clock_timestamp()"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["group_id"], ["groups.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index("ix_group_invites_group_id", "group_invites", ["group_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_group_invites_group_id", table_name="group_invites")
    op.drop_table("group_invites")
