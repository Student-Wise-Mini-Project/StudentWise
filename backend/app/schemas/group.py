"""Group request/response schemas."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.models.enums import GroupType, MemberRole
from app.schemas.user import UserOut


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: GroupType
    currency: str = Field(default="ILS", min_length=3, max_length=3)


class GroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    currency: str | None = Field(default=None, min_length=3, max_length=3)


class MemberAdd(BaseModel):
    email: EmailStr | None = None
    user_id: uuid.UUID | None = None
    default_split_weight: Decimal = Field(default=Decimal("1"), gt=0)

    @model_validator(mode="after")
    def exactly_one_identifier(self) -> "MemberAdd":
        if (self.email is None) == (self.user_id is None):
            raise ValueError("Provide exactly one of email or user_id")
        return self


class MemberUpdate(BaseModel):
    default_split_weight: Decimal = Field(gt=0)


class GroupMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user: UserOut
    role: MemberRole
    default_split_weight: Decimal
    joined_at: datetime
    left_at: datetime | None = None


class GroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    type: GroupType
    currency: str
    created_by: uuid.UUID
    created_at: datetime
    #: Null while the group is open. Set once it is closed.
    archived_at: datetime | None = None
    members: list[GroupMemberOut] = []
