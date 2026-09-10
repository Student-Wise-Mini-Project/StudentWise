"""User queries. Builds queries and flushes -- never commits."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User


class UserRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, user_id: uuid.UUID) -> User | None:
        return self.db.get(User, user_id)

    def get_by_email(self, email: str) -> User | None:
        stmt = select(User).where(User.email == email.strip().lower())
        return self.db.scalars(stmt).one_or_none()

    def search_by_email(self, fragment: str, limit: int = 10) -> list[User]:
        stmt = (
            select(User)
            .where(User.email.ilike(f"%{fragment.strip()}%"))
            .order_by(User.email)
            .limit(limit)
        )
        return list(self.db.scalars(stmt))

    def add(self, user: User) -> User:
        self.db.add(user)
        self.db.flush()
        return user
