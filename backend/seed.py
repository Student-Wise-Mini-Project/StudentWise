"""Seed the development database with demo data.

Run from `backend/` with the venv active:

    python seed.py

Wipes StudentWise's own tables first, so it is safe to run repeatedly -- on
your own machine. Anywhere else it asks you to name the host you are about to
wipe (deployment: docs/deployment.md):

    python seed.py --wipe=ep-xyz-123.eu-central-1.aws.neon.tech

It goes
through the service layer, so the seeded data obeys the same invariants the API
enforces (splits summing exactly to totals, participants being group members).
"""

import sys
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import delete, make_url, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.domain.recurrence import RecurrenceFrequency
from app.models.budget import Budget
from app.models.chat import ChatConversation, ChatMessage
from app.models.comment import ExpenseComment
from app.models.enums import (
    ExpenseCategory,
    ExpenseSource,
    GroupType,
    SettlementMethod,
    SplitType,
)
from app.models.expense import Expense, ExpenseSplit
from app.models.expense_embedding import ExpenseEmbedding
from app.models.expense_item import ExpenseItem, ItemSplit
from app.models.gmail_connection import GmailConnection
from app.models.group import Group, GroupMember
from app.models.group_invite import GroupInvite
from app.models.idempotency import IdempotencyKey
from app.models.ingested_bill import IngestedBill
from app.models.notification import Notification
from app.models.receipt_image import ReceiptImage
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
        ChatMessage,
        ChatConversation,
        ExpenseEmbedding,
        IngestedBill,
        GmailConnection,
        Notification,
        IdempotencyKey,
        Budget,
        SplitRuleShare,
        SplitRule,
        RecurringBillParticipant,
        RecurringBill,
        ExpenseComment,
        ItemSplit,
        ExpenseItem,
        ExpenseSplit,
        ReceiptImage,
        Expense,
        Settlement,
        GroupInvite,
        GroupMember,
        Group,
        User,
    ):
        db.execute(delete(model))
    db.commit()


def backdate(db) -> None:
    """Make six weeks of seeded history actually look like six weeks.

    `created_at` defaults to `clock_timestamp()`, which is right for the app and
    wrong for a seed: one run stamps every row with the moment the script was
    executed. Anything ordered or grouped by `created_at` -- the activity feed,
    and the day headings on the home screen -- then collapses into a single
    "Today", which is the opposite of what this data exists to demonstrate.

    So each row is pushed back onto its own event date once everything is
    written: an expense to its `expense_date`, a settlement to its `settled_at`.
    Rows sharing a date keep the order they were inserted in, a minute apart, so
    the feed's tiebreaker still has something real to break ties with.

    `updated_at` moves with it. Leaving it at "now" would make every seeded
    expense report itself as edited, because the detail screen decides that by
    comparing the two.
    """
    minute_of = {}

    for expense in db.scalars(select(Expense).order_by(Expense.created_at)).all():
        seen = minute_of.get(expense.expense_date, 0)
        minute_of[expense.expense_date] = seen + 1
        # Early evening: the hour a flat actually enters the shopping.
        stamp = datetime.combine(expense.expense_date, time(18, 0), tzinfo=UTC) + timedelta(
            minutes=seen
        )
        expense.created_at = stamp
        expense.updated_at = stamp

    for settlement in db.scalars(select(Settlement)).all():
        settlement.created_at = settlement.settled_at
        settlement.updated_at = settlement.settled_at

    db.commit()


def spend(
    db,
    group,
    *,
    payer,
    title,
    amount,
    when,
    category,
    split=SplitType.EQUAL,
    participants=None,
    creator=None,
):
    """One expense, with the arguments this file actually varies.

    A wrapper rather than a table of tuples: the interesting thing about seed
    data is the combination of who paid, who is on it and how it splits, and a
    tuple table hides exactly that behind positional arguments.
    """
    return expense_service.create_expense(
        db,
        group,
        creator=creator or payer,
        payer_id=payer.id,
        title=title,
        total_amount=Decimal(amount),
        expense_date=when,
        split_type=split,
        participants=participants,
        category=category,
        source=ExpenseSource.MANUAL,
    )


def only(*users):
    """Participants for an expense that does not involve the whole group."""
    return [ParticipantSpec(user_id=user.id) for user in users]


def shares(pairs):
    """Participants with a typed share: an exact amount, a percent or a weight."""
    return [ParticipantSpec(user_id=user.id, share_value=Decimal(value)) for user, value in pairs]


def main(db: Session | None = None) -> None:
    """Build the demo world. Pass a session to build it somewhere else -- the
    Text-to-SQL evaluation and its tests build it in the test database."""
    owns_session = db is None
    db = db or SessionLocal()
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

        # ------------------------------------------------------------------
        # More of Gal's life. One flat is enough to prove the API works and not
        # enough to see whether the app does: the home screen sums across
        # groups, the group switcher needs something to switch between, and a
        # single ILS group never exercises the rule that balances in different
        # currencies are never added together.
        #
        # So: five groups, four of them new, deliberately different from each
        # other along the axes the UI actually branches on --
        #
        #   currency     Berlin is in EUR, everything else in ILS
        #   ownership    Gal owns two of them and is a plain member of two
        #   size         solo, a couple, a flat of three, a trip of four
        #   settled-ness Eilat is squared up to the cent; the rest are not
        #
        # There is also one group Gal is not in at all, which is the only way to
        # see that the list endpoint filters rather than returning everything.
        # ------------------------------------------------------------------

        yotam = auth_service.register(
            db, name="Yotam", email="yotam@studentwise.dev", password=PASSWORD
        )
        hila = auth_service.register(
            db, name="Hila", email="hila@studentwise.dev", password=PASSWORD
        )
        dana = auth_service.register(
            db, name="Dana", email="dana@studentwise.dev", password=PASSWORD
        )
        omri = auth_service.register(
            db, name="Omri", email="omri@studentwise.dev", password=PASSWORD
        )

        # --- Berlin, in euros, and Gal did not create it ---------------------
        #
        # Two things this group exists to test. The currency is EUR, so any
        # screen that adds Gal's position across groups has to either keep the
        # currencies apart or be visibly wrong. And Maya owns it, so Gal sees
        # the member-not-owner version of the group screens -- no rename, no
        # remove-member, no delete.
        berlin = group_service.create_group(
            db, owner=maya, name="Berlin, August", type=GroupType.TRIP, currency="EUR"
        )
        for user in (gal, yotam, hila):
            group_service.add_member(db, berlin, user_id=user.id)

        spend(
            db,
            berlin,
            payer=maya,
            title="Flights, four of us",
            amount="1248.00",
            when=date(2026, 8, 14),
            category=ExpenseCategory.TRANSPORT,
        )
        # The flat had one big room, one shared twin and a sofa bed, so the
        # Airbnb is the trip's WEIGHT split: 3 + 2 + 2 + 1 over 744 is 93 a unit
        # and comes out exact.
        airbnb = spend(
            db,
            berlin,
            payer=gal,
            title="Airbnb in Kreuzberg, 6 nights",
            amount="744.00",
            when=date(2026, 8, 15),
            category=ExpenseCategory.OTHER,
            split=SplitType.WEIGHT,
            participants=shares([(maya, "3"), (gal, "2"), (yotam, "2"), (hila, "1")]),
        )
        spend(
            db,
            berlin,
            payer=yotam,
            title="Currywurst and beers",
            amount="86.40",
            when=date(2026, 8, 16),
            category=ExpenseCategory.EATING_OUT,
        )
        # Hila went to bed. A three-way split inside a four-person group is the
        # case that makes somebody open the expense to check.
        spend(
            db,
            berlin,
            payer=maya,
            title="Berghain, the three who got in",
            amount="54.00",
            when=date(2026, 8, 17),
            category=ExpenseCategory.ENTERTAINMENT,
            participants=only(gal, maya, yotam),
        )
        spend(
            db,
            berlin,
            payer=hila,
            title="U-Bahn week passes",
            amount="118.00",
            when=date(2026, 8, 18),
            category=ExpenseCategory.TRANSPORT,
        )
        spend(
            db,
            berlin,
            payer=gal,
            title="Rewe run",
            amount="63.20",
            when=date(2026, 8, 19),
            category=ExpenseCategory.GROCERIES,
        )
        spend(
            db,
            berlin,
            payer=yotam,
            title="Museum Island passes",
            amount="76.00",
            when=date(2026, 8, 20),
            category=ExpenseCategory.ENTERTAINMENT,
        )
        spend(
            db,
            berlin,
            payer=maya,
            title="Taxi to Schoenefeld",
            amount="48.00",
            when=date(2026, 8, 21),
            category=ExpenseCategory.TRANSPORT,
        )

        comment_service.create_comment(
            db, airbnb, berlin, author=hila, body="Why is my share the small one?"
        )
        comment_service.create_comment(
            db,
            airbnb,
            berlin,
            author=gal,
            body="You had the sofa bed. The weights are 3 / 2 / 2 / 1.",
        )

        settlement_service.create_settlement(
            db,
            berlin,
            creator=yotam,
            from_user_id=yotam.id,
            to_user_id=gal.id,
            amount=Decimal("120.00"),
            method=SettlementMethod.PAYBOX,
            note="Towards the Airbnb",
            settled_at=datetime(2026, 8, 24, 19, 30, tzinfo=UTC),
        )

        # --- Gal and Yotam, the two-person case ------------------------------
        #
        # A couple has exactly one balance and one possible transfer, so the
        # settle-up screen has to look deliberate rather than like a list that
        # happens to have one row in it.
        couple = group_service.create_group(
            db, owner=gal, name="Gal & Yotam", type=GroupType.COUPLE
        )
        group_service.add_member(db, couple, user_id=yotam.id)

        spend(
            db,
            couple,
            payer=yotam,
            title="Sushi at Ichi Ban",
            amount="218.00",
            when=date(2026, 9, 2),
            category=ExpenseCategory.EATING_OUT,
        )
        spend(
            db,
            couple,
            payer=gal,
            title="Cinema City",
            amount="96.00",
            when=date(2026, 9, 4),
            category=ExpenseCategory.ENTERTAINMENT,
        )
        spend(
            db,
            couple,
            payer=gal,
            title="Hotel in Haifa",
            amount="640.00",
            when=date(2026, 9, 6),
            category=ExpenseCategory.OTHER,
        )
        spend(
            db,
            couple,
            payer=yotam,
            title="Tiv Taam",
            amount="184.30",
            when=date(2026, 9, 9),
            category=ExpenseCategory.GROCERIES,
        )
        # An odd total over two people: 75.01 / 75.00. This is the rounding the
        # client is forbidden from working out for itself.
        spend(
            db,
            couple,
            payer=gal,
            title="Birthday present for Noa",
            amount="150.01",
            when=date(2026, 9, 10),
            category=ExpenseCategory.OTHER,
        )
        settlement_service.create_settlement(
            db,
            couple,
            creator=yotam,
            from_user_id=yotam.id,
            to_user_id=gal.id,
            amount=Decimal("200.00"),
            method=SettlementMethod.BIT,
            note="Haifa",
            settled_at=datetime(2026, 9, 7, 9, 15, tzinfo=UTC),
        )

        # --- Eilat, settled to the cent --------------------------------------
        #
        # Every other group has somebody owing somebody. This one does not, so
        # the balances and settle-up screens have to say "you are square" rather
        # than show an empty list and leave the reader to infer it. The three
        # transfers below are the exact net positions, worked out by hand so the
        # group really does land on zero.
        eilat = group_service.create_group(
            db, owner=noa, name="Eilat, that weekend", type=GroupType.TRIP
        )
        for user in (gal, dana, omri):
            group_service.add_member(db, eilat, user_id=user.id)

        spend(
            db,
            eilat,
            payer=noa,
            title="Hotel, two nights",
            amount="1240.00",
            when=date(2026, 7, 17),
            category=ExpenseCategory.OTHER,
        )
        spend(
            db,
            eilat,
            payer=gal,
            title="Petrol, both ways",
            amount="310.00",
            when=date(2026, 7, 17),
            category=ExpenseCategory.TRANSPORT,
        )
        # Only the two of them dived.
        spend(
            db,
            eilat,
            payer=omri,
            title="Diving at the Satil wreck",
            amount="680.00",
            when=date(2026, 7, 18),
            category=ExpenseCategory.ENTERTAINMENT,
            participants=only(gal, omri),
        )
        spend(
            db,
            eilat,
            payer=dana,
            title="Dinner at the marina",
            amount="452.60",
            when=date(2026, 7, 18),
            category=ExpenseCategory.EATING_OUT,
        )
        for payer, amount, when in (
            (gal, "530.65", datetime(2026, 7, 20, 11, 0, tzinfo=UTC)),
            (omri, "160.65", datetime(2026, 7, 20, 18, 40, tzinfo=UTC)),
            (dana, "48.05", datetime(2026, 7, 21, 8, 5, tzinfo=UTC)),
        ):
            settlement_service.create_settlement(
                db,
                eilat,
                creator=payer,
                from_user_id=payer.id,
                to_user_id=noa.id,
                amount=Decimal(amount),
                method=SettlementMethod.BIT,
                note="Eilat, squared up",
                settled_at=when,
            )

        # --- Gal on their own ------------------------------------------------
        #
        # A SOLO group has no balances and nothing to settle: it is a spending
        # diary. Worth seeding because every screen that assumes other people
        # has to cope with there being none, and because it gives the charts
        # several months of one person's own data. The dates run back to April
        # so the trend has a shape rather than a single bar.
        solo = group_service.create_group(db, owner=gal, name="Just me", type=GroupType.SOLO)
        for title, amount, when, category in (
            ("Gym, April", "249.00", date(2026, 4, 2), ExpenseCategory.OTHER),
            ("Rav-Kav top up", "150.00", date(2026, 4, 11), ExpenseCategory.TRANSPORT),
            ("Gym, May", "249.00", date(2026, 5, 2), ExpenseCategory.OTHER),
            ("Textbooks", "412.00", date(2026, 5, 19), ExpenseCategory.OTHER),
            ("Gym, June", "249.00", date(2026, 6, 2), ExpenseCategory.OTHER),
            ("Rav-Kav top up", "150.00", date(2026, 6, 14), ExpenseCategory.TRANSPORT),
            ("Gym, July", "249.00", date(2026, 7, 2), ExpenseCategory.OTHER),
            ("Coffee at Cafelix", "17.00", date(2026, 7, 23), ExpenseCategory.EATING_OUT),
            ("Gym, August", "249.00", date(2026, 8, 2), ExpenseCategory.OTHER),
            ("Spotify", "19.90", date(2026, 8, 8), ExpenseCategory.ENTERTAINMENT),
            ("Gym, September", "249.00", date(2026, 9, 2), ExpenseCategory.OTHER),
            ("Haircut", "80.00", date(2026, 9, 8), ExpenseCategory.OTHER),
        ):
            spend(db, solo, payer=gal, title=title, amount=amount, when=when, category=category)

        budget_service.create_budget(
            db,
            solo,
            membership=GroupRepository(db).get_membership(solo.id, gal.id),
            creator=gal,
            category=ExpenseCategory.EATING_OUT,
            amount=Decimal("300.00"),
        )

        # --- A group Gal is not in -------------------------------------------
        #
        # The only way to tell a working filter from a missing one. If this ever
        # appears in Gal's group list, GET /api/groups is returning the table.
        florentin = group_service.create_group(
            db, owner=maya, name="Florentin 22", type=GroupType.SHARED_APARTMENT
        )
        for user in (noa, dana):
            group_service.add_member(db, florentin, user_id=user.id)
        spend(
            db,
            florentin,
            payer=maya,
            title="Rent, September",
            amount="7200.00",
            when=date(2026, 9, 1),
            category=ExpenseCategory.RENT,
        )
        spend(
            db,
            florentin,
            payer=dana,
            title="Bezeq internet",
            amount="139.00",
            when=date(2026, 9, 3),
            category=ExpenseCategory.UTILITIES,
        )

        # Everything is written; now make the history look like history.
        backdate(db)

        print("Seeded:")
        print(f"  flat    : {flat.name} ({flat.id})")
        print(f"  trip    : {berlin.name} -- EUR, Gal is a member, not the owner")
        print(f"  couple  : {couple.name}")
        print(f"  trip    : {eilat.name} -- fully settled, balances are all zero")
        print(f"  solo    : {solo.name} -- Gal alone, six months of history")
        print(f"  hidden  : {florentin.name} -- Gal is NOT in this one, on purpose")
        print("  users   : gal, maya, noa, yotam, hila, dana, omri @studentwise.dev")
        print(f"  password: {PASSWORD}")
        print("  49 expenses, 6 settlements, 4 comments, and the notifications they raised")
        print("  1 split rule (rent by room size), 3 budgets, 2 recurring bills")
        print("  Gal is owed in Berlin and the couple, and owes in the flat -- on purpose,")
        print("  so the home screen has to show a position per currency and never a sum.")
        print()
        print("  Try:  POST /api/groups/{id}/recurring-bills/run")
        print("        GET  /api/groups/{id}/budgets")
        print("        GET  /api/groups/{id}/analytics/duplicates")
    finally:
        if owns_session:
            db.close()


def may_wipe(database_url: str, argv: list[str]) -> bool:
    """Whether this run may wipe the database it points at.

    Local databases, always. Any other host only when it is named on the
    command line: a production DATABASE_URL left in a terminal is one
    up-arrow away from deleting every real expense, and typing the host is
    the moment someone notices which one they are about to delete.
    """
    host = make_url(database_url).host
    return host in {"localhost", "127.0.0.1", None} or f"--wipe={host}" in argv


if __name__ == "__main__":
    if not may_wipe(settings.database_url, sys.argv[1:]):
        host = make_url(settings.database_url).host
        sys.exit(
            f"This would DELETE EVERYTHING in the database on {host}.\n"
            f"If that is what you want, run:  python seed.py --wipe={host}"
        )
    main()
