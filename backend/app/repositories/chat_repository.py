"""Chat conversation queries. Builds queries and flushes -- never commits."""

import uuid

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from app.models.chat import ChatConversation, ChatMessage


def _mine(group_id: uuid.UUID, user_id: uuid.UUID) -> list[ColumnElement[bool]]:
    """Shared by the page and its count, so the total always matches the page."""
    return [ChatConversation.group_id == group_id, ChatConversation.user_id == user_id]


class ChatRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, conversation_id: uuid.UUID) -> ChatConversation | None:
        return self.db.get(ChatConversation, conversation_id)

    def list_mine(
        self, group_id: uuid.UUID, user_id: uuid.UUID, *, limit: int = 50, offset: int = 0
    ) -> list[ChatConversation]:
        """The conversation you were last in, first."""
        stmt = (
            select(ChatConversation)
            .where(*_mine(group_id, user_id))
            .order_by(ChatConversation.last_message_at.desc(), ChatConversation.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(self.db.scalars(stmt))

    def count_mine(self, group_id: uuid.UUID, user_id: uuid.UUID) -> int:
        stmt = select(func.count()).select_from(ChatConversation).where(*_mine(group_id, user_id))
        return self.db.scalar(stmt) or 0

    def recent_messages(self, conversation_id: uuid.UUID, *, limit: int) -> list[ChatMessage]:
        """The last `limit` messages, oldest first, as the model reads them."""
        stmt = (
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conversation_id)
            .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
            .limit(limit)
        )
        return list(reversed(self.db.scalars(stmt).all()))

    def add(self, row: ChatConversation | ChatMessage) -> None:
        # Flushed one at a time: a question and its answer are written in one
        # transaction, and separate statements give them distinct timestamps.
        self.db.add(row)
        self.db.flush()

    def delete(self, conversation: ChatConversation) -> None:
        self.db.delete(conversation)
        self.db.flush()
