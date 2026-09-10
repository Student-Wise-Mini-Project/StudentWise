"""Claiming an idempotency key.

Called from inside another service's transaction, and **never commits** -- the
service that creates the resource owns the commit, so the key and the thing it
protects land together.

Used by `expense_service.create_expense` and
`settlement_service.create_settlement`; nothing else needs it yet.
"""

import hashlib
import uuid
from dataclasses import dataclass

from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ConflictError
from app.models.idempotency import IdempotencyKey
from app.models.user import User
from app.repositories.idempotency_repository import IdempotencyRepository


@dataclass(frozen=True)
class Replay:
    """This key has been used before, and here is what it made."""

    resource_id: uuid.UUID


def fingerprint(payload: BaseModel) -> str:
    """A stable hash of a request body.

    Pydantic serialises fields in declaration order, so the same request always
    hashes the same way without needing to sort anything.
    """
    return hashlib.sha256(payload.model_dump_json().encode()).hexdigest()


def claim(
    db: Session,
    *,
    user: User,
    scope: str,
    key: str,
    request_fingerprint: str,
) -> IdempotencyKey | Replay:
    """Reserve a key, or report that it has already been used.

    Returns the row to fill in on success, or a `Replay` naming what the first
    request created.
    """
    repo = IdempotencyRepository(db)

    existing = repo.get(user.id, scope, key)
    if existing is not None:
        return _resolve(existing, request_fingerprint)

    row = IdempotencyKey(user_id=user.id, scope=scope, key=key, fingerprint=request_fingerprint)
    try:
        # A SAVEPOINT, so losing the race costs this insert rather than the whole
        # transaction. Two identical requests arriving together both reach here;
        # the second blocks on the unique index until the first commits, then
        # fails, and reads the winner's row below.
        with db.begin_nested():
            repo.add(row)
    except IntegrityError:
        winner = repo.get(user.id, scope, key)
        if winner is None:
            # The row vanished between the conflict and the re-read, which means
            # the other request rolled back. Saying so beats guessing.
            raise ConflictError(
                "That request is still being processed. Try again in a moment."
            ) from None
        return _resolve(winner, request_fingerprint)

    return row


def _resolve(existing: IdempotencyKey, request_fingerprint: str) -> Replay:
    if existing.fingerprint != request_fingerprint:
        raise ConflictError(
            "This Idempotency-Key was already used for a different request. "
            "Use a new key for a new request."
        )
    if existing.resource_id is None:
        raise ConflictError("That request is still being processed. Try again in a moment.")
    return Replay(resource_id=existing.resource_id)
