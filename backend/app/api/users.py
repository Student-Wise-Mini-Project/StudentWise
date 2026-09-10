"""User lookup endpoints."""

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/search", response_model=list[UserOut])
def search_users(
    current_user: CurrentUser,
    db: DbSession,
    email: str = Query(min_length=3, description="Email fragment to search for"),
) -> list[UserOut]:
    """Find users by email, so you can add them to a group."""
    users = UserRepository(db).search_by_email(email)
    return [UserOut.model_validate(u) for u in users]
