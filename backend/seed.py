"""Seed the development database with demo data.

Run from `backend/` with the venv active:

    python seed.py

Wipes StudentWise's own tables first, so it is safe to run repeatedly. It goes
through the service layer, so the seeded data obeys the same invariants the API
enforces (splits summing exactly to totals, participants being group members).
"""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import delete

from app.db import SessionLocal
from app.domain.recurrence import RecurrenceFrequency
from app.models.budget import Budget
from app.models.comment import ExpenseComment
from app.models.enums import (
    ExpenseCategory,
    ExpenseSource,
    GroupType,
    SettlementMethod,
    SplitType,
)
from app.models.expense import Expense, ExpenseSplit
from app.models.group import Group, GroupMember
from app.models.idempotency import IdempotencyKey
from app.models.notification import Notification
from app.models.recurring_bill import RecurringBill, RecurringBillParticipant
from app.models.settlement import Settlement
from app.models.split_rule import SplitRule, SplitRuleShare
from app.models.user import User
from app.repositories.group_repository import GroupRepository
from app.services import (
    auth_service,
    budget_service,
    comment_service,
    expense_service,
    group_service,
    recurring_bill_service,
    settlement_service,
    split_rule_service,
)
from app.services.expense_service import ParticipantSpec
from app.services.split_rule_service import ShareSpec

PASSWORD = "password123"


def wipe(db) -> None:
    """Order matters: children before parents."""
    for model in (
        Notification,
        IdempotencyKey,
        Budget,
        SplitRuleShare,
        SplitRule,
        RecurringBillParticipant,
        RecurringBill,
        ExpenseComment,
        ExpenseSplit,
        Expense,
        Settlement,
        GroupMember,
        Group,
        User,
    ):
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

        gal_membership = GroupRepository(db).get_membership(flat.id, gal.id)

        # Rooms are 14, 12 and 10 square metres, so rent is not split evenly.
        # Every RENT expense from here on lands on these proportions without
        # anybody typing them (mission 3.4).
        split_rule_service.create_rule(
            db,
            flat,
            membership=gal_membership,
            creator=gal,
            name="Rent by room size",
            category=ExpenseCategory.RENT,
            shares=[
                ShareSpec(user_id=gal.id, weight=Decimal("14")),
                ShareSpec(user_id=maya.id, weight=Decimal("12")),
                ShareSpec(user_id=noa.id, weight=Decimal("10")),
            ],
        )

        # One budget comfortably under, one about to be blown, so the report has
        # something to show on both sides (mission 4.6).
        budget_service.create_budget(
            db,
            flat,
            membership=gal_membership,
            creator=gal,
            category=ExpenseCategory.GROCERIES,
            amount=Decimal("1200.00"),
        )
        budget_service.create_budget(
            db,
            flat,
            membership=gal_membership,
            creator=gal,
            category=ExpenseCategory.UTILITIES,
            amount=Decimal("500.00"),
        )

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
        oat_milk = expense_service.create_expense(
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

        # A thread on the one expense that does not include everybody -- which is
        # exactly the kind that gets argued about.
        comment_service.create_comment(
            db, oat_milk, flat, author=noa, body="Why am I not on this one?"
        )
        comment_service.create_comment(
            db,
            oat_milk,
            flat,
            author=gal,
            body="You do not drink it -- say the word and I will add you.",
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

        # Two recurring bills, one of each kind (Epic 6). Rent knows what it
        # costs and posts itself; electricity does not and waits to be told.
        recurring_bill_service.create_bill(
            db,
            flat,
            creator=gal,
            title="Rent",
            frequency=RecurrenceFrequency.MONTHLY,
            first_due_on=date.today() + timedelta(days=2),
            payer_id=gal.id,
            amount=Decimal("3600.00"),
            category=ExpenseCategory.RENT,
        )
        recurring_bill_service.create_bill(
            db,
            flat,
            creator=maya,
            title="Electricity bill",
            frequency=RecurrenceFrequency.EVERY_2_MONTHS,
            first_due_on=date.today() + timedelta(days=1),
            payer_id=maya.id,
            amount=None,  # whatever the meter says
            category=ExpenseCategory.UTILITIES,
        )

        print("Seeded:")
        print(f"  group   : {flat.name} ({flat.id})")
        print("  users   : gal@studentwise.dev, maya@studentwise.dev, noa@studentwise.dev")
        print(f"  password: {PASSWORD}")
        print("  18 expenses (incl. 6 months of electricity and water), 1 settlement")
        print("  2 comments, plus the notifications every one of those actions raised")
        print("  1 split rule (rent by room size), 2 budgets, 2 recurring bills")
        print()
        print("  Try:  POST /api/groups/{id}/recurring-bills/run")
        print("        GET  /api/groups/{id}/budgets")
        print("        GET  /api/groups/{id}/analytics/duplicates")
    finally:
        db.close()


if __name__ == "__main__":
    main()
