"""The money assistant: conversations about one group's spending (Epic 8).

Each conversation is private to the person who started it. The assistant
reads the group's data through tools and can never change it.
"""

from fastapi import APIRouter, Query, status

from app.core.deps import (
    ConversationForOwner,
    CurrentUser,
    DbSession,
    GroupMembership,
    ReadOnlyConnection,
)
from app.schemas.chat import ChatMessageIn, ConversationDetailOut, ConversationOut
from app.schemas.page import Page
from app.services import chat_service

group_router = APIRouter(prefix="/groups", tags=["chat"])
router = APIRouter(prefix="/chat", tags=["chat"])


@group_router.get("/{group_id}/chat/conversations", response_model=Page[ConversationOut])
def list_conversations(
    membership: GroupMembership,
    current_user: CurrentUser,
    db: DbSession,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> Page[ConversationOut]:
    """Your own conversations in this group, most recent first."""
    conversations, total = chat_service.list_conversations(
        db, membership.group, current_user, limit=limit, offset=offset
    )
    return Page[ConversationOut](
        items=[ConversationOut.model_validate(c) for c in conversations],
        total=total,
        limit=limit,
        offset=offset,
    )


@group_router.post(
    "/{group_id}/chat/conversations",
    response_model=ConversationDetailOut,
    status_code=status.HTTP_201_CREATED,
)
def start_conversation(
    payload: ChatMessageIn,
    membership: GroupMembership,
    current_user: CurrentUser,
    db: DbSession,
    readonly: ReadOnlyConnection,
) -> ConversationDetailOut:
    """Ask the first question; the conversation is created with its answer.

    Nothing is saved if no answer comes back. **503** without an Anthropic key,
    or when the model is busy or could not finish.
    """
    conversation = chat_service.start_conversation(
        db,
        readonly,
        membership.group,
        current_user,
        message=payload.message,
        language=payload.language,
    )
    return ConversationDetailOut.model_validate(conversation)


@router.get("/conversations/{conversation_id}", response_model=ConversationDetailOut)
def get_conversation(context: ConversationForOwner) -> ConversationDetailOut:
    return ConversationDetailOut.model_validate(context.conversation)


@router.post("/conversations/{conversation_id}/messages", response_model=ConversationDetailOut)
def send_message(
    payload: ChatMessageIn,
    context: ConversationForOwner,
    current_user: CurrentUser,
    db: DbSession,
    readonly: ReadOnlyConnection,
) -> ConversationDetailOut:
    """Ask a follow-up. Returns the whole conversation, the new answer last."""
    conversation = chat_service.send_message(
        db,
        readonly,
        context.conversation,
        context.membership.group,
        current_user,
        message=payload.message,
        language=payload.language,
    )
    return ConversationDetailOut.model_validate(conversation)


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(context: ConversationForOwner, db: DbSession) -> None:
    chat_service.delete_conversation(db, context.conversation)
