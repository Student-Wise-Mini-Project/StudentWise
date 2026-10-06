"""One round of the money assistant's conversation with Claude (mission 8.2).

The loop that calls tools and feeds their results back lives in
`chat_service`, which knows the group and the database. This module only
sends a conversation and tools to the model and says what came back, behind
one function the tests replace -- no test needs a key or a network.
"""

from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

import anthropic

from app.config import settings
from app.core.errors import BadRequestError, ServiceUnavailableError


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    input: dict[str, Any]


@dataclass(frozen=True)
class ModelTurn:
    """What one model call returned."""

    #: "end_turn" when it has answered, "tool_use" when it wants tool results.
    stop_reason: str
    #: The text blocks, joined. The answer, when `stop_reason` is "end_turn".
    text: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    #: The response's content blocks exactly as returned, to be sent back as
    #: the assistant's message when the tool results go in. Thinking blocks
    #: must go back untouched, so nothing here is rebuilt.
    content: list[Any] = field(default_factory=list)


@lru_cache(maxsize=1)
def _client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


def respond(
    system: list[dict[str, Any]], tools: list[dict[str, Any]], messages: list[Any]
) -> ModelTurn:
    """Ask Claude for the next step. Separated so tests can replace it."""
    if not settings.anthropic_api_key:
        raise ServiceUnavailableError(
            "The assistant is not configured on this server (ANTHROPIC_API_KEY is not set)"
        )

    client = _client().with_options(timeout=settings.chat_timeout_seconds, max_retries=1)
    try:
        response = client.messages.create(
            model=settings.chat_model,
            max_tokens=16000,
            thinking={"type": "adaptive"},
            system=system,
            tools=tools,
            messages=messages,
        )
    except (anthropic.APIConnectionError, anthropic.RateLimitError) as error:
        raise ServiceUnavailableError("The assistant is busy. Try again in a moment.") from error
    except anthropic.APIStatusError as error:
        raise ServiceUnavailableError("The assistant is unavailable right now.") from error

    if response.stop_reason == "refusal":
        raise BadRequestError("The assistant can't help with that one.")

    return ModelTurn(
        stop_reason=response.stop_reason or "end_turn",
        text="".join(block.text for block in response.content if block.type == "text").strip(),
        tool_calls=[
            ToolCall(id=block.id, name=block.name, input=dict(block.input))
            for block in response.content
            if block.type == "tool_use"
        ],
        content=list(response.content),
    )
