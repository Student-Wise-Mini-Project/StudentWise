"""chat conversations

Mission 8.1: conversations with the money assistant, one person in one group.

Only what was said is stored. The tool calls behind an answer are re-run on
every turn, so a follow-up never reasons from numbers that have since changed;
`tools_used` records which ones an answer drew on, so the screen can say.

Both tables cascade from their group, so deleting a group leaves no
conversations about it behind.

The role CHECK constraint comes from the `Enum(create_constraint=True)` column.
Autogenerate also emitted it twice more as explicit CheckConstraints with the
same name, which Postgres refuses; those were removed, as in 0a6ad07d70e6.

Revision ID: 7bd0ad0e9592
Revises: 0a6ad07d70e6
Create Date: 2026-10-06 10:18:17.485485

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7bd0ad0e9592"
down_revision: str | Sequence[str] | None = "0a6ad07d70e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "chat_conversations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("group_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("clock_timestamp()"),
            nullable=False,
        ),
        sa.Column(
            "last_message_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("clock_timestamp()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["group_id"], ["groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_chat_conversations_user_group_last",
        "chat_conversations",
        ["user_id", "group_id", "last_message_at"],
        unique=False,
    )
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column(
            "role",
            sa.Enum(
                "USER",
                "ASSISTANT",
                name="chatrole_check",
                native_enum=False,
                create_constraint=True,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "tools_used",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("clock_timestamp()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["conversation_id"], ["chat_conversations.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_chat_messages_conversation_created",
        "chat_messages",
        ["conversation_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_chat_messages_conversation_created", table_name="chat_messages")
    op.drop_table("chat_messages")
    op.drop_index("ix_chat_conversations_user_group_last", table_name="chat_conversations")
    op.drop_table("chat_conversations")
