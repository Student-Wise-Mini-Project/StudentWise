"""Ingested bill queries. Builds queries and flushes -- never commits."""

import uuid

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from app.models.enums import IngestedBillStatus
from app.models.ingested_bill import IngestedBill

#: The statuses a bill has once it is an expense.
_BECAME_AN_EXPENSE = (IngestedBillStatus.IMPORTED, IngestedBillStatus.APPROVED)


def _filters(user_id: uuid.UUID, status: IngestedBillStatus | None) -> list[ColumnElement[bool]]:
    """Shared by the page and its count, so the total cannot disagree with it."""
    clauses: list[ColumnElement[bool]] = [IngestedBill.user_id == user_id]
    if status is not None:
        clauses.append(IngestedBill.status == status)
    return clauses


class IngestedBillRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_for_user(self, user_id: uuid.UUID, bill_id: uuid.UUID) -> IngestedBill | None:
        stmt = select(IngestedBill).where(
            IngestedBill.id == bill_id, IngestedBill.user_id == user_id
        )
        return self.db.scalars(stmt).first()

    def known_message_ids(self, user_id: uuid.UUID, message_ids: list[str]) -> set[str]:
        if not message_ids:
            return set()
        stmt = select(IngestedBill.gmail_message_id).where(
            IngestedBill.user_id == user_id, IngestedBill.gmail_message_id.in_(message_ids)
        )
        return set(self.db.scalars(stmt))

    def list_for_user(
        self,
        user_id: uuid.UUID,
        *,
        status: IngestedBillStatus | None,
        limit: int,
        offset: int,
    ) -> list[IngestedBill]:
        stmt = (
            select(IngestedBill)
            .where(*_filters(user_id, status))
            .order_by(IngestedBill.created_at.desc(), IngestedBill.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(self.db.scalars(stmt).unique())

    def count_for_user(self, user_id: uuid.UUID, *, status: IngestedBillStatus | None) -> int:
        stmt = select(func.count()).select_from(IngestedBill).where(*_filters(user_id, status))
        return self.db.scalar(stmt) or 0

    def find_split_invoice(
        self, group_id: uuid.UUID, provider_name: str, invoice_number: str
    ) -> IngestedBill | None:
        """The same bill already split in this flat -- from anyone's mailbox.

        Two flatmates who both receive the electricity bill must not both
        import it. Only while that expense still exists, though: once it is
        deleted (`expense_id` goes NULL), the bill may come in again -- or a
        deleted mistake would block the real bill forever, as a duplicate of
        nothing. Found on a real inbox.
        """
        stmt = select(IngestedBill).where(
            IngestedBill.group_id == group_id,
            IngestedBill.status.in_(_BECAME_AN_EXPENSE),
            IngestedBill.expense_id.is_not(None),
            func.lower(IngestedBill.provider_name) == provider_name.lower(),
            IngestedBill.invoice_number == invoice_number,
        )
        return self.db.scalars(stmt).first()

    def add(self, bill: IngestedBill) -> IngestedBill:
        self.db.add(bill)
        self.db.flush()
        return bill
