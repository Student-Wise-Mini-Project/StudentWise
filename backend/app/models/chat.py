"""Conversations with the money assistant (mission 8.1).

A conversation belongs to one person *and* one group: the assistant answers
from that group's data, and somebody's questions about their flat are not
their flatmates' business, so there are no shared conversations.

Only what was said is stored -- the question and the final answer. The tool
calls in between are re-run on every turn rather than replayed, so a follow-up
question never reasons from numbers that have since changed. Which tools an
answer used is kept on the answer, so the screen can say what it looked at.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import ChatRole, enum_column


class ChatConversation(Base):
    __tablename__ = "chat_conversations"
    __table_args__ = (
        Index("ix_chat_conversations_user_group_last", "user_id", "group_id", "last_message_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # Cascades: a deleted group takes its conversations with it, the same as
    # its expenses.
    group_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    #: The opening question, shortened. Shown in the list of conversations.
    title: Mapped[str] = mapped_column(String(120), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp(), nullable=False
    )
    #: What the list is ordered by: the conversation you were last in, first.
    last_message_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp(), nullable=False
    )

    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="conversation",
        order_by="(ChatMessage.created_at, ChatMessage.id)",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self) -> str:
        return f"<ChatConversation {self.title!r} user={self.user_id}>"


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        Index("ix_chat_messages_conversation_created", "conversation_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chat_conversations.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[ChatRole] = mapped_column(enum_column(ChatRole), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    #: For an answer: each tool it used, as `{"name": ..., "input": {...}}`.
    tools_used: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, server_default="[]", default=list
    )

    # clock_timestamp(), not now(): a question and its answer are written in one
    # transaction, and they must not tie.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp(), nullable=False
    )

    conversation: Mapped[ChatConversation] = relationship(back_populates="messages")

    def __repr__(self) -> str:
        return f"<ChatMessage {self.role} {self.content[:30]!r}>"
