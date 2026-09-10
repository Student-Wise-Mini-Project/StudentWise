"""Split-rule endpoints -- how a group has agreed to divide certain expenses."""

import uuid

from fastapi import APIRouter, status

from app.core.deps import CurrentUser, DbSession, GroupMembership
from app.schemas.split_rule import SplitRuleCreate, SplitRuleOut, SplitRuleUpdate
from app.services import split_rule_service
from app.services.split_rule_service import ShareSpec

router = APIRouter(prefix="/groups", tags=["split rules"])


def _specs(shares) -> list[ShareSpec]:
    return [ShareSpec(user_id=s.user_id, weight=s.weight) for s in shares]


@router.get("/{group_id}/split-rules", response_model=list[SplitRuleOut])
def list_split_rules(membership: GroupMembership, db: DbSession) -> list[SplitRuleOut]:
    """Every member can read these -- it is how you find out why rent came out
    the way it did."""
    rules = split_rule_service.list_rules(db, membership.group)
    return [SplitRuleOut.model_validate(r) for r in rules]


@router.post(
    "/{group_id}/split-rules", response_model=SplitRuleOut, status_code=status.HTTP_201_CREATED
)
def create_split_rule(
    payload: SplitRuleCreate,
    membership: GroupMembership,
    current_user: CurrentUser,
    db: DbSession,
) -> SplitRuleOut:
    rule = split_rule_service.create_rule(
        db,
        membership.group,
        membership=membership,
        creator=current_user,
        name=payload.name,
        category=payload.category,
        shares=_specs(payload.shares),
    )
    return SplitRuleOut.model_validate(rule)


@router.patch("/{group_id}/split-rules/{rule_id}", response_model=SplitRuleOut)
def update_split_rule(
    rule_id: uuid.UUID,
    payload: SplitRuleUpdate,
    membership: GroupMembership,
    db: DbSession,
) -> SplitRuleOut:
    """`category` is not editable -- delete and recreate instead, so a change
    that alters what every future expense costs is a deliberate act."""
    rule = split_rule_service.get_rule(db, membership.group, rule_id)
    updated = split_rule_service.update_rule(
        db,
        membership.group,
        rule,
        membership=membership,
        name=payload.name,
        shares=_specs(payload.shares) if payload.shares is not None else None,
    )
    return SplitRuleOut.model_validate(updated)


@router.delete("/{group_id}/split-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_split_rule(rule_id: uuid.UUID, membership: GroupMembership, db: DbSession) -> None:
    """Expenses already split by this rule keep their splits."""
    rule = split_rule_service.get_rule(db, membership.group, rule_id)
    split_rule_service.delete_rule(db, rule, membership=membership)
