"""Settlement queries. Builds queries and flushes -- never commits."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.settlement import Settlement


class SettlementRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, settlement_id: uuid.UUID) -> Settlement | None:
        return self.db.get(Settlement, settlement_id)

    def list_by_group(
        self, group_id: uuid.UUID, *, limit: int = 50, offset: int = 0
    ) -> list[Settlement]:
        stmt = (
            select(Settlement)
            .where(Settlement.group_id == group_id)
            .order_by(Settlement.settled_at.desc(), Settlement.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(self.db.scalars(stmt).unique())

    def count_by_group(self, group_id: uuid.UUID) -> int:
        stmt = select(func.count()).select_from(Settlement).where(Settlement.group_id == group_id)
        return self.db.scalar(stmt) or 0

    def add(self, settlement: Settlement) -> Settlement:
        self.db.add(settlement)
        self.db.flush()
        return settlement

    def delete(self, settlement: Settlement) -> None:
        self.db.delete(settlement)
        self.db.flush()
