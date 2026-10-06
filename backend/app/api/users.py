"""User lookup and your own profile."""

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.user import ProfileUpdate, UserOut, UserSearchOut
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/search", response_model=list[UserSearchOut])
def search_users(
    current_user: CurrentUser,
    db: DbSession,
    email: str = Query(min_length=3, description="Email fragment to search for"),
) -> list[UserSearchOut]:
    """Find users by email, so you can add them to a group.

    Name and email only: this reaches every account, so it never returns a
    phone number.
    """
    users = UserRepository(db).search_by_email(email)
    return [UserSearchOut.model_validate(u) for u in users]


@router.patch("/me", response_model=UserOut)
def update_me(payload: ProfileUpdate, current_user: CurrentUser, db: DbSession) -> User:
    """Set or remove your phone number.

    An Israeli mobile, because that is what Bit and PayBox use. Any usual
    spelling is accepted and it is stored as `+9725XXXXXXXX`; a landline or
    anything else is a **422**.
    """
    return user_service.update_phone_number(db, current_user, phone_number=payload.phone_number)
