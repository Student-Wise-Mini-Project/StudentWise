"""Balances and settlement plans. Read-only -- nothing here commits.

The balance rule, in one line:

    net = paid - owed + settlements_sent - settlements_received

A positive net means the group owes that person; negative means they owe the
group. Because every expense creates matching credit and debt, and every
settlement moves the same amount between two people, the nets always sum to
zero. `minimise_transfers` asserts that, which makes it a live check on this
calculation.
"""

import uuid
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy.orm import Session

from app.domain.settlement_algo import Transfer, minimise_transfers
from app.models.group import Group
from app.models.user import User
from app.repositories.balance_repository import BalanceRepository
from app.repositories.group_repository import GroupRepository

ZERO = Decimal("0.00")


@dataclass(frozen=True)
class UserBalance:
    user: User
    paid: Decimal
    owed: Decimal
    settlements_sent: Decimal
    settlements_received: Decimal
    net: Decimal


@dataclass(frozen=True)
class PlannedTransfer:
    from_user: User
    to_user: User
    amount: Decimal


def compute_balances(db: Session, group: Group) -> list[UserBalance]:
    """One row per person with a stake in this group, richest creditor first."""
    repo = BalanceRepository(db)
    paid = repo.paid_totals(group.id)
    owed = repo.owed_totals(group.id)
    sent = repo.settlements_sent(group.id)
    received = repo.settlements_received(group.id)

    balances = []
    for membership in GroupRepository(db).all_memberships(group.id):
        user_id = membership.user_id
        row = UserBalance(
            user=membership.user,
            paid=paid.get(user_id, ZERO),
            owed=owed.get(user_id, ZERO),
            settlements_sent=sent.get(user_id, ZERO),
            settlements_received=received.get(user_id, ZERO),
            net=(
                paid.get(user_id, ZERO)
                - owed.get(user_id, ZERO)
                + sent.get(user_id, ZERO)
                - received.get(user_id, ZERO)
            ),
        )
        # Someone who has left only stays on the list while they still owe or
        # are owed something.
        if membership.is_active or row.net != ZERO:
            balances.append(row)

    balances.sort(key=lambda b: (-b.net, b.user.name))
    return balances


def compute_settlement_plan(db: Session, group: Group) -> list[PlannedTransfer]:
    """The fewest transfers that would settle the group up.

    Suggestions only -- nothing is written. Recording an actual repayment is
    POST /groups/{id}/settlements, which is what makes these balances move.
    """
    balances = compute_balances(db, group)
    by_id: dict[uuid.UUID, User] = {b.user.id: b.user for b in balances}
    nets = {b.user.id: b.net for b in balances}

    transfers: list[Transfer] = minimise_transfers(nets)
    return [
        PlannedTransfer(
            from_user=by_id[t.from_user_id],
            to_user=by_id[t.to_user_id],
            amount=t.amount,
        )
        for t in transfers
    ]
