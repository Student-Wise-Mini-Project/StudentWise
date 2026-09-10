"""Aggregate queries behind balances. Read-only -- never commits."""

import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.expense import Expense, ExpenseSplit
from app.models.settlement import Settlement


class BalanceRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def paid_totals(self, group_id: uuid.UUID) -> dict[uuid.UUID, Decimal]:
        """How much each person has laid out, by being the payer on an expense."""
        stmt = (
            select(Expense.payer_id, func.sum(Expense.total_amount))
            .where(Expense.group_id == group_id)
            .group_by(Expense.payer_id)
        )
        return {user_id: total for user_id, total in self.db.execute(stmt)}

    def owed_totals(self, group_id: uuid.UUID) -> dict[uuid.UUID, Decimal]:
        """How much each person's share of the group's expenses comes to."""
        stmt = (
            select(ExpenseSplit.user_id, func.sum(ExpenseSplit.owed_amount))
            .join(Expense, Expense.id == ExpenseSplit.expense_id)
            .where(Expense.group_id == group_id)
            .group_by(ExpenseSplit.user_id)
        )
        return {user_id: total for user_id, total in self.db.execute(stmt)}

    def settlements_sent(self, group_id: uuid.UUID) -> dict[uuid.UUID, Decimal]:
        stmt = (
            select(Settlement.from_user_id, func.sum(Settlement.amount))
            .where(Settlement.group_id == group_id)
            .group_by(Settlement.from_user_id)
        )
        return {user_id: total for user_id, total in self.db.execute(stmt)}

    def settlements_received(self, group_id: uuid.UUID) -> dict[uuid.UUID, Decimal]:
        stmt = (
            select(Settlement.to_user_id, func.sum(Settlement.amount))
            .where(Settlement.group_id == group_id)
            .group_by(Settlement.to_user_id)
        )
        return {user_id: total for user_id, total in self.db.execute(stmt)}
