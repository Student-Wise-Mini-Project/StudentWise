"""Seed the development database with demo data.

Run from `backend/` with the venv active:

    python seed.py

Wipes StudentWise's own tables first, so it is safe to run repeatedly. It goes
through the service layer, so the seeded data obeys the same invariants the API
enforces (splits summing exactly to totals, participants being group members).
"""

from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import delete

from app.db import SessionLocal
from app.models.enums import (
    ExpenseCategory,
    ExpenseSource,
    GroupType,
    SettlementMethod,
    SplitType,
)
from app.models.expense import Expense, ExpenseSplit
from app.models.group import Group, GroupMember
from app.models.settlement import Settlement
from app.models.user import User
from app.services import auth_service, expense_service, group_service, settlement_service
from app.services.expense_service import ParticipantSpec

PASSWORD = "password123"


def wipe(db) -> None:
    """Order matters: children before parents."""
    for model in (ExpenseSplit, Expense, Settlement, GroupMember, Group, User):
        db.execute(delete(model))
    db.commit()


def main() -> None:
    db = SessionLocal()
    try:
        wipe(db)

        gal = auth_service.register(db, name="Gal", email="gal@studentwise.dev", password=PASSWORD)
        maya = auth_service.register(
            db, name="Maya", email="maya@studentwise.dev", password=PASSWORD
        )
        noa = auth_service.register(db, name="Noa", email="noa@studentwise.dev", password=PASSWORD)

        flat = group_service.create_group(
            db, owner=gal, name="Dizengoff 5", type=GroupType.SHARED_APARTMENT
        )
        for user in (maya, noa):
            group_service.add_member(db, flat, user_id=user.id)

        everyone = None  # omitting participants includes all active members

        expense_service.create_expense(
            db,
            flat,
            creator=gal,
            payer_id=gal.id,
            title="Shufersal groceries",
            total_amount=Decimal("337.80"),
            expense_date=date(2026, 9, 1),
            split_type=SplitType.EQUAL,
            participants=everyone,
            category=ExpenseCategory.GROCERIES,
        )
        expense_service.create_expense(
            db,
            flat,
            creator=maya,
            payer_id=maya.id,
            title="Electricity bill",
            total_amount=Decimal("412.00"),
            expense_date=date(2026, 9, 3),
            split_type=SplitType.EQUAL,
            participants=everyone,
            category=ExpenseCategory.UTILITIES,
        )
        # 100 / 3 -- the rounding case worth eyeballing in the API.
        expense_service.create_expense(
            db,
            flat,
            creator=noa,
            payer_id=noa.id,
            title="Cleaning supplies",
            total_amount=Decimal("100.00"),
            expense_date=date(2026, 9, 5),
            split_type=SplitType.EQUAL,
            participants=everyone,
            category=ExpenseCategory.OTHER,
        )
        # Only two of the three flatmates drink the oat milk.
        expense_service.create_expense(
            db,
            flat,
            creator=gal,
            payer_id=gal.id,
            title="Oat milk crate",
            total_amount=Decimal("64.00"),
            expense_date=date(2026, 9, 6),
            split_type=SplitType.EQUAL,
            participants=[ParticipantSpec(user_id=gal.id), ParticipantSpec(user_id=maya.id)],
            category=ExpenseCategory.GROCERIES,
        )
        expense_service.create_expense(
            db,
            flat,
            creator=maya,
            payer_id=maya.id,
            title="Internet (Maya pays more, bigger room)",
            total_amount=Decimal("120.00"),
            expense_date=date(2026, 9, 7),
            split_type=SplitType.PERCENTAGE,
            participants=[
                ParticipantSpec(user_id=gal.id, share_value=Decimal("30")),
                ParticipantSpec(user_id=maya.id, share_value=Decimal("50")),
                ParticipantSpec(user_id=noa.id, share_value=Decimal("20")),
            ],
            category=ExpenseCategory.UTILITIES,
        )
        expense_service.create_expense(
            db,
            flat,
            creator=noa,
            payer_id=noa.id,
            title="Pizza night",
            total_amount=Decimal("143.50"),
            expense_date=date(2026, 9, 8),
            split_type=SplitType.EXACT,
            participants=[
                ParticipantSpec(user_id=gal.id, share_value=Decimal("50.00")),
                ParticipantSpec(user_id=maya.id, share_value=Decimal("50.00")),
                ParticipantSpec(user_id=noa.id, share_value=Decimal("43.50")),
            ],
            category=ExpenseCategory.ENTERTAINMENT,
            source=ExpenseSource.MANUAL,
        )

        # A run of recurring bills, so the anomaly endpoint has real history to
        # work with. Electricity is steady until August, when it triples --
        # someone left the air conditioning on. Water stays boring on purpose:
        # detection has to be quiet about normal variation, not just loud about
        # spikes.
        recurring = [
            (
                "Electricity bill",
                maya,
                [
                    (date(2026, 3, 5), "388.00"),
                    (date(2026, 4, 5), "401.50"),
                    (date(2026, 5, 5), "376.20"),
                    (date(2026, 6, 5), "419.90"),
                    (date(2026, 7, 5), "395.80"),
                    (date(2026, 8, 5), "1244.00"),
                ],
            ),
            (
                "Water bill",
                noa,
                [
                    (date(2026, 3, 12), "142.00"),
                    (date(2026, 4, 12), "155.30"),
                    (date(2026, 5, 12), "138.90"),
                    (date(2026, 6, 12), "161.40"),
                    (date(2026, 7, 12), "149.70"),
                    (date(2026, 8, 12), "153.20"),
                ],
            ),
        ]
        for title, payer, readings in recurring:
            for when, amount in readings:
                expense_service.create_expense(
                    db,
                    flat,
                    creator=payer,
                    payer_id=payer.id,
                    title=title,
                    total_amount=Decimal(amount),
                    expense_date=when,
                    split_type=SplitType.EQUAL,
                    participants=everyone,
                    category=ExpenseCategory.UTILITIES,
                )

        settlement_service.create_settlement(
            db,
            flat,
            creator=maya,
            from_user_id=maya.id,
            to_user_id=gal.id,
            amount=Decimal("100.00"),
            method=SettlementMethod.BIT,
            note="Partial payback for groceries",
            settled_at=datetime(2026, 9, 9, 12, 0, tzinfo=UTC),
        )

        print("Seeded:")
        print(f"  group   : {flat.name} ({flat.id})")
        print("  users   : gal@studentwise.dev, maya@studentwise.dev, noa@studentwise.dev")
        print(f"  password: {PASSWORD}")
        print("  18 expenses (incl. 6 months of electricity and water), 1 settlement")
    finally:
        db.close()


if __name__ == "__main__":
    main()
