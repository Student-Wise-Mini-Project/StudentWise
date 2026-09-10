"""Split-rule queries. Builds queries and flushes -- never commits."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import ExpenseCategory
from app.models.split_rule import SplitRule


class SplitRuleRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, rule_id: uuid.UUID) -> SplitRule | None:
        return self.db.get(SplitRule, rule_id)

    def list_by_group(self, group_id: uuid.UUID) -> list[SplitRule]:
        """Named rules first, then the catch-all, so a list reads specific to
        general -- which is also the order they are matched in."""
        stmt = (
            select(SplitRule)
            .where(SplitRule.group_id == group_id)
            .order_by(SplitRule.category.is_(None), SplitRule.category, SplitRule.name)
        )
        return list(self.db.scalars(stmt).unique())

    def get_for_category(
        self, group_id: uuid.UUID, category: ExpenseCategory | None
    ) -> SplitRule | None:
        """The rule that claims this category, if there is one."""
        if category is None:
            return None
        stmt = select(SplitRule).where(
            SplitRule.group_id == group_id, SplitRule.category == category
        )
        return self.db.scalars(stmt).unique().first()

    def get_catch_all(self, group_id: uuid.UUID) -> SplitRule | None:
        stmt = select(SplitRule).where(SplitRule.group_id == group_id, SplitRule.category.is_(None))
        return self.db.scalars(stmt).unique().first()

    def add(self, rule: SplitRule) -> SplitRule:
        self.db.add(rule)
        self.db.flush()
        return rule

    def delete(self, rule: SplitRule) -> None:
        self.db.delete(rule)
        self.db.flush()
