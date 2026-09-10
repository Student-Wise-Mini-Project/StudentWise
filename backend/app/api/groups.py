"""Group and membership endpoints.

Every route below `/{group_id}` depends on `GroupMembership`, which 404s for a
missing group and 403s for a non-member.
"""

import uuid

from fastapi import APIRouter, status

from app.core.deps import CurrentUser, DbSession, GroupMembership
from app.schemas.group import (
    GroupCreate,
    GroupMemberOut,
    GroupOut,
    GroupUpdate,
    MemberAdd,
    MemberUpdate,
)
from app.services import group_service

router = APIRouter(prefix="/groups", tags=["groups"])


@router.get("", response_model=list[GroupOut])
def list_groups(current_user: CurrentUser, db: DbSession) -> list[GroupOut]:
    groups = group_service.list_groups(db, current_user)
    return [GroupOut.model_validate(g) for g in groups]


@router.post("", response_model=GroupOut, status_code=status.HTTP_201_CREATED)
def create_group(payload: GroupCreate, current_user: CurrentUser, db: DbSession) -> GroupOut:
    group = group_service.create_group(
        db,
        owner=current_user,
        name=payload.name,
        type=payload.type,
        currency=payload.currency,
    )
    return GroupOut.model_validate(group)


@router.get("/{group_id}", response_model=GroupOut)
def get_group(membership: GroupMembership) -> GroupOut:
    return GroupOut.model_validate(membership.group)


@router.patch("/{group_id}", response_model=GroupOut)
def update_group(payload: GroupUpdate, membership: GroupMembership, db: DbSession) -> GroupOut:
    group_service.require_owner(membership)
    group = group_service.update_group(
        db, membership.group, name=payload.name, currency=payload.currency
    )
    return GroupOut.model_validate(group)


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(membership: GroupMembership, db: DbSession) -> None:
    group_service.require_owner(membership)
    group_service.delete_group(db, membership.group)


@router.post(
    "/{group_id}/members", response_model=GroupMemberOut, status_code=status.HTTP_201_CREATED
)
def add_member(payload: MemberAdd, membership: GroupMembership, db: DbSession) -> GroupMemberOut:
    member = group_service.add_member(
        db,
        membership.group,
        email=payload.email,
        user_id=payload.user_id,
        default_split_weight=payload.default_split_weight,
    )
    return GroupMemberOut.model_validate(member)


@router.patch("/{group_id}/members/{user_id}", response_model=GroupMemberOut)
def update_member(
    user_id: uuid.UUID,
    payload: MemberUpdate,
    membership: GroupMembership,
    db: DbSession,
) -> GroupMemberOut:
    member = group_service.update_member(
        db, membership.group, user_id, default_split_weight=payload.default_split_weight
    )
    return GroupMemberOut.model_validate(member)


@router.delete("/{group_id}/members/{user_id}", response_model=GroupMemberOut)
def remove_member(
    user_id: uuid.UUID,
    membership: GroupMembership,
    db: DbSession,
) -> GroupMemberOut:
    """Mark a member as having left. Owners can remove anyone; anyone can remove
    themselves. The membership row survives so history stays intact."""
    member = group_service.remove_member(
        db, membership.group, user_id, acting_membership=membership
    )
    return GroupMemberOut.model_validate(member)
