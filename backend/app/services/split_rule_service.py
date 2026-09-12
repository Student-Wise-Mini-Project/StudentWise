"""Split-rule business rules. Owns the transaction.

Rules change how everyone's money is divided, so writing one is an owner's job.
Reading one is not: every member should be able to see why rent came out the way
it did.
"""

import uuid
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.errors import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.models.enums import ExpenseCategory, MemberRole
from app.models.group import Group, GroupMember
from app.models.split_rule import SplitRule, SplitRuleShare
from app.models.user import User
from app.repositories.group_repository import GroupRepository
from app.repositories.split_rule_repository import SplitRuleRepository
from app.services import group_service


@dataclass(frozen=True)
class ShareSpec:
    user_id: uuid.UUID
    weight: Decimal


def _require_owner(membership: GroupMember) -> None:
    if membership.role is not MemberRole.OWNER:
        raise ForbiddenError("Only a group owner can change how expenses are split")


def _validated_shares(db: Session, group: Group, shares: list[ShareSpec]) -> list[SplitRuleShare]:
    if not shares:
        raise BadRequestError("A rule needs at least one person in it")

    active = {m.user_id for m in GroupRepository(db).active_members(group.id)}
    seen: set[uuid.UUID] = set()
    rows = []
    for share in shares:
        if share.user_id in seen:
            raise BadRequestError("Each person can appear in a rule only once")
        seen.add(share.user_id)

        if share.user_id not in active:
            raise BadRequestError(f"User {share.user_id} is not an active member of this group")
        if share.weight <= 0:
            raise BadRequestError("Every weight must be greater than zero")

        rows.append(SplitRuleShare(user_id=share.user_id, weight=share.weight))
    return rows


def get_rule(db: Session, group: Group, rule_id: uuid.UUID) -> SplitRule:
    rule = SplitRuleRepository(db).get(rule_id)
    if rule is None or rule.group_id != group.id:
        raise NotFoundError("Split rule not found")
    return rule


def list_rules(db: Session, group: Group) -> list[SplitRule]:
    return SplitRuleRepository(db).list_by_group(group.id)


def create_rule(
    db: Session,
    group: Group,
    *,
    membership: GroupMember,
    creator: User,
    name: str,
    category: ExpenseCategory | None,
    shares: list[ShareSpec],
) -> SplitRule:
    _require_owner(membership)
    group_service.require_open(group)

    repo = SplitRuleRepository(db)
    existing = (
        repo.get_for_category(group.id, category) if category else repo.get_catch_all(group.id)
    )
    if existing is not None:
        target = category.value if category else "every category"
        raise ConflictError(
            f"This group already has a rule for {target}: {existing.name}. Edit it instead."
        )

    rule = SplitRule(
        group_id=group.id,
        name=name.strip(),
        category=category,
        created_by=creator.id,
        shares=_validated_shares(db, group, shares),
    )
    repo.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


def update_rule(
    db: Session,
    group: Group,
    rule: SplitRule,
    *,
    membership: GroupMember,
    name: str | None = None,
    shares: list[ShareSpec] | None = None,
) -> SplitRule:
    """The category is deliberately not editable.

    Moving a rule from RENT to UTILITIES silently changes what every future
    utilities expense costs each person. Deleting and creating makes that an
    explicit act, and leaves a trace of it in the activity the group can see.
    """
    _require_owner(membership)
    group_service.require_open(group)

    if name is not None:
        rule.name = name.strip()

    if shares is not None:
        new_shares = _validated_shares(db, group, shares)
        # Delete then flush before adding, or SQLAlchemy inserts the
        # replacements first and trips the (rule_id, user_id) unique index.
        rule.shares.clear()
        db.flush()
        rule.shares.extend(new_shares)

    db.commit()
    db.refresh(rule)
    return rule


def delete_rule(db: Session, rule: SplitRule, *, membership: GroupMember) -> None:
    """Expenses already split by this rule keep their splits.

    `expenses.split_rule_id` is ON DELETE SET NULL: the money that has already
    changed hands does not move because a rule was deleted, it just stops saying
    which rule produced it.
    """
    _require_owner(membership)
    SplitRuleRepository(db).delete(rule)
    db.commit()


# --- applying a rule to a new expense ---------------------------------------


def find_applicable(
    db: Session, group: Group, category: ExpenseCategory | None
) -> SplitRule | None:
    """The rule that should split an expense in this category, if any.

    Most specific wins: a RENT rule beats the group catch-all. An expense with
    no category can only ever match the catch-all -- guessing which named rule
    an uncategorised expense meant would be worse than not applying one.
    """
    repo = SplitRuleRepository(db)
    return repo.get_for_category(group.id, category) or repo.get_catch_all(group.id)


def shares_for(db: Session, group: Group, rule: SplitRule) -> list[ShareSpec]:
    """The rule's shares, minus anyone who has since left the group.

    A rule written when four people lived here should not start rejecting every
    rent expense the day one of them moves out. Dropping the departed share and
    re-weighting the rest is also the right answer for rent by room size: the
    remaining rooms are still the sizes they were.
    """
    active = {m.user_id for m in GroupRepository(db).active_members(group.id)}
    return [
        ShareSpec(user_id=share.user_id, weight=share.weight)
        for share in rule.shares
        if share.user_id in active
    ]
