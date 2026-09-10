"""Recurring-bill queries. Builds queries and flushes -- never commits."""

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.recurring_bill import RecurringBill


class RecurringBillRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, bill_id: uuid.UUID) -> RecurringBill | None:
        return self.db.get(RecurringBill, bill_id)

    def list_by_group(self, group_id: uuid.UUID) -> list[RecurringBill]:
        """Soonest due first -- which is the order anyone reads this list in."""
        stmt = (
            select(RecurringBill)
            .where(RecurringBill.group_id == group_id)
            .order_by(RecurringBill.next_due_on, RecurringBill.title)
        )
        return list(self.db.scalars(stmt).unique())

    def due_in_group(self, group_id: uuid.UUID, *, on_or_before: date) -> list[RecurringBill]:
        stmt = (
            select(RecurringBill)
            .where(
                RecurringBill.group_id == group_id,
                RecurringBill.active.is_(True),
                RecurringBill.next_due_on <= on_or_before,
            )
            .order_by(RecurringBill.next_due_on)
        )
        return list(self.db.scalars(stmt).unique())

    def due_everywhere(self, *, on_or_before: date) -> list[RecurringBill]:
        """Every active bill due anywhere. Used by the cron entry point.

        Indexed on `next_due_on`, so this stays a range scan rather than a table
        scan as the number of groups grows.
        """
        stmt = (
            select(RecurringBill)
            .where(
                RecurringBill.active.is_(True),
                RecurringBill.next_due_on <= on_or_before,
            )
            .order_by(RecurringBill.group_id, RecurringBill.next_due_on)
        )
        return list(self.db.scalars(stmt).unique())

    def add(self, bill: RecurringBill) -> RecurringBill:
        self.db.add(bill)
        self.db.flush()
        return bill

    def delete(self, bill: RecurringBill) -> None:
        self.db.delete(bill)
        self.db.flush()
