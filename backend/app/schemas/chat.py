"""Money-assistant request/response schemas."""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ChatRole


class ChatMessageIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    #: The language the app is shown in. The answer comes back in it.
    language: Literal["en", "he"] = "en"


class ToolUseOut(BaseModel):
    #: One of the tool names in `chat_tools.TOOLS`; the client names it in words.
    name: str
    input: dict[str, Any]


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: ChatRole
    content: str
    #: For an answer, what it looked at. Empty for a question.
    tools_used: list[ToolUseOut]
    created_at: datetime


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    group_id: uuid.UUID
    title: str
    created_at: datetime
    last_message_at: datetime


class ConversationDetailOut(ConversationOut):
    #: Oldest first.
    messages: list[ChatMessageOut]
