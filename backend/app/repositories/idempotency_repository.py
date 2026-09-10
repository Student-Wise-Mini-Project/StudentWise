"""Idempotency-key queries. Builds queries and flushes -- never commits."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.idempotency import IdempotencyKey


class IdempotencyRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, user_id: uuid.UUID, scope: str, key: str) -> IdempotencyKey | None:
        stmt = select(IdempotencyKey).where(
            IdempotencyKey.user_id == user_id,
            IdempotencyKey.scope == scope,
            IdempotencyKey.key == key,
        )
        return self.db.scalars(stmt).first()

    def add(self, row: IdempotencyKey) -> IdempotencyKey:
        self.db.add(row)
        self.db.flush()
        return row
