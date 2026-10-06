"""User-facing user representations."""

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, EmailStr

from app.domain.phone import normalize_il_mobile


def _blank_is_none(value: object) -> object:
    # A cleared form field arrives as "" -- that means "no number", not an
    # invalid one.
    return None if isinstance(value, str) and not value.strip() else value


def _mobile_or_none(value: str | None) -> str | None:
    return None if value is None else normalize_il_mobile(value)


#: An Israeli mobile number in any usual spelling, stored as E.164. The
#: domain's `ValueError` becomes an ordinary 422 on the field.
IsraeliMobile = Annotated[
    str | None, BeforeValidator(_blank_is_none), AfterValidator(_mobile_or_none)
]


class UserOut(BaseModel):
    """A user as returned by the API. Never includes password_hash.

    Includes the phone number, so it is only ever returned to the user
    themselves or to someone who shares a group with them -- who needs it to pay
    them back.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: EmailStr
    phone_number: str | None = None
    created_at: datetime


class UserSearchOut(BaseModel):
    """A search hit: enough to recognise someone and add them to a group.

    No phone number. Search reaches every account in the app, not only people
    you share a group with, so a phone number here would make it a phone book.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: EmailStr


class ProfileUpdate(BaseModel):
    """Change your own profile. `null` or `""` removes the phone number."""

    phone_number: IsraeliMobile
