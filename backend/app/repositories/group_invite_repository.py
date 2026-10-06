"""Group-invite queries. Builds queries and flushes -- never commits."""

import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.group_invite import GroupInvite


class GroupInviteRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def by_token(self, token: str) -> GroupInvite | None:
        return self.db.scalars(select(GroupInvite).where(GroupInvite.token == token)).one_or_none()

    def current(self, group_id: uuid.UUID, now: datetime) -> GroupInvite | None:
        """The group's working link, if it has one. The newest wins."""
        stmt = (
            select(GroupInvite)
            .where(
                GroupInvite.group_id == group_id,
                GroupInvite.revoked_at.is_(None),
                GroupInvite.expires_at > now,
            )
            .order_by(GroupInvite.created_at.desc(), GroupInvite.id.desc())
            .limit(1)
        )
        return self.db.scalars(stmt).first()

    def revoke_all(self, group_id: uuid.UUID, now: datetime) -> None:
        self.db.execute(
            update(GroupInvite)
            .where(GroupInvite.group_id == group_id, GroupInvite.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        self.db.flush()

    def add(self, invite: GroupInvite) -> GroupInvite:
        self.db.add(invite)
        self.db.flush()
        return invite
