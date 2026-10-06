"""Your own profile. Owns the transaction."""

from sqlalchemy.orm import Session

from app.models.user import User


def update_phone_number(db: Session, user: User, *, phone_number: str | None) -> User:
    """Set or clear the number people use to pay you back with Bit or PayBox.

    `phone_number` arrives already normalised to E.164 by the request schema
    (`app.domain.phone`), or None to remove it.
    """
    user.phone_number = phone_number
    db.commit()
    return user
