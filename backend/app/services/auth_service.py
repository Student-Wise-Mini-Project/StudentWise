"""Registration and login. Owns the transaction."""

from sqlalchemy.orm import Session

from app.core.errors import ConflictError, UnauthorizedError
from app.core.security import hash_password, verify_password
from app.models.user import User
from app.repositories.user_repository import UserRepository


def register(
    db: Session,
    *,
    name: str,
    email: str,
    password: str,
    phone_number: str | None = None,
) -> User:
    repo = UserRepository(db)
    normalized = email.strip().lower()
    if repo.get_by_email(normalized) is not None:
        raise ConflictError("Email already registered")

    user = User(
        name=name.strip(),
        email=normalized,
        password_hash=hash_password(password),
        phone_number=phone_number,
    )
    repo.add(user)
    db.commit()
    return user


def authenticate(db: Session, *, email: str, password: str) -> User:
    user = UserRepository(db).get_by_email(email)
    # Same message either way -- don't leak which emails are registered.
    if user is None or not verify_password(password, user.password_hash):
        raise UnauthorizedError("Incorrect email or password")
    return user
