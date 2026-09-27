"""Connecting a user's Gmail, and fetching the bills in it (missions 5.8-5.9).

Nothing runs on a scheduler. `sync` is triggered -- by the app when someone
opens it, or by `backend/fetch_new_bills.py` from a real cron -- and is safe to
run any number of times: an email already looked at is never read again.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from sqlalchemy.orm import Session

from app.ai import gmail
from app.ai.gmail import GmailAuthError
from app.config import settings
from app.core import crypto
from app.core.errors import BadRequestError, NotFoundError, ServiceUnavailableError
from app.models.enums import IngestedBillStatus
from app.models.gmail_connection import GmailConnection
from app.models.user import User
from app.repositories.gmail_connection_repository import GmailConnectionRepository
from app.repositories.ingested_bill_repository import IngestedBillRepository
from app.repositories.user_repository import UserRepository
from app.services import ingested_bill_service

#: The OAuth `state` is a short-lived JWT for this purpose only. The audience is
#: what stops it being replayed as a login token: `decode_access_token` does not
#: name an audience, so PyJWT rejects any token that carries one.
STATE_AUDIENCE = "studentwise:gmail-connect"
STATE_LIFETIME = timedelta(minutes=10)
#: How many recent matches to look through for ones not yet read.
SEARCH_WINDOW = 50


def _require_ready() -> None:
    gmail._require_configured()
    if not crypto.encryption_configured():
        raise ServiceUnavailableError(
            "Gmail is not configured on this server (TOKEN_ENCRYPTION_KEY is not set)"
        )


# --- connecting -------------------------------------------------------------


def connect_url(user: User) -> str:
    """Google's consent page for this user. The state ties the answer to them."""
    _require_ready()
    now = datetime.now(UTC)
    state = jwt.encode(
        {
            "sub": str(user.id),
            "aud": STATE_AUDIENCE,
            "iat": now,
            "exp": now + STATE_LIFETIME,
            "nonce": uuid.uuid4().hex,
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    return gmail.authorization_url(state)


def _user_from_state(db: Session, state: str) -> User:
    try:
        payload = jwt.decode(
            state,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            audience=STATE_AUDIENCE,
        )
        user_id = uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError) as error:
        raise BadRequestError("The Gmail sign-in link is invalid or has expired") from error
    user = UserRepository(db).get(user_id)
    if user is None:
        raise BadRequestError("The Gmail sign-in link is invalid or has expired")
    return user


def complete_connection(db: Session, *, code: str, state: str) -> GmailConnection:
    """Google sent the browser back with a code. Store the grant, encrypted."""
    _require_ready()
    user = _user_from_state(db, state)
    try:
        grant = gmail.exchange_code(code)
    except GmailAuthError as error:
        raise BadRequestError(str(error)) from error

    repo = GmailConnectionRepository(db)
    connection = repo.get_for_user(user.id)
    if connection is None:
        connection = repo.add(
            GmailConnection(
                user_id=user.id,
                google_email=grant.email,
                refresh_token_encrypted=crypto.encrypt(grant.refresh_token),
            )
        )
    else:
        # Reconnecting replaces the token, including one Google had expired.
        connection.google_email = grant.email
        connection.refresh_token_encrypted = crypto.encrypt(grant.refresh_token)
        connection.needs_reconnect = False
        connection.connected_at = datetime.now(UTC)
    db.commit()
    db.refresh(connection)
    return connection


def get_connection(db: Session, user: User) -> GmailConnection | None:
    return GmailConnectionRepository(db).get_for_user(user.id)


def disconnect(db: Session, user: User) -> None:
    """Revoke at Google and forget the token. Bills already imported stay."""
    repo = GmailConnectionRepository(db)
    connection = repo.get_for_user(user.id)
    if connection is None:
        raise NotFoundError("Gmail is not connected")
    try:
        token = crypto.decrypt(connection.refresh_token_encrypted)
    except ServiceUnavailableError:
        token = None
    repo.delete(connection)
    db.commit()
    # After the commit: our copy is gone whatever Google says.
    if token:
        gmail.revoke(token)


# --- fetching ---------------------------------------------------------------


@dataclass
class SyncResult:
    checked: int = 0
    imported: int = 0
    needs_review: int = 0
    skipped: int = 0
    needs_reconnect: bool = False


def sync(db: Session, user: User) -> SyncResult:
    """Look for new bills in this user's Gmail and deal with each one.

    Reads at most `gmail_max_messages_per_sync` new emails -- each is a model
    call and somebody may be waiting -- and the rest are picked up next time.
    """
    _require_ready()
    connection = get_connection(db, user)
    if connection is None:
        raise NotFoundError("Gmail is not connected")

    result = SyncResult()
    if connection.needs_reconnect:
        result.needs_reconnect = True
        return result

    try:
        mailbox = gmail.open_mailbox(crypto.decrypt(connection.refresh_token_encrypted))
        query = gmail.bill_search_query(
            lookback_days=settings.gmail_lookback_days,
            trusted_domains=settings.bill_trusted_sender_domains,
        )
        found = mailbox.search(query, SEARCH_WINDOW)
        known = IngestedBillRepository(db).known_message_ids(user.id, found)
        new = [message_id for message_id in found if message_id not in known]
        for message_id in new[: settings.gmail_max_messages_per_sync]:
            status = ingested_bill_service.ingest(db, user, mailbox.fetch(message_id))
            result.checked += 1
            if status is IngestedBillStatus.IMPORTED:
                result.imported += 1
            elif status is IngestedBillStatus.PENDING_REVIEW:
                result.needs_review += 1
            else:
                result.skipped += 1
    except GmailAuthError:
        connection.needs_reconnect = True
        result.needs_reconnect = True

    connection.last_synced_at = datetime.now(UTC)
    db.commit()
    return result


def sync_everyone(db: Session) -> dict[uuid.UUID, SyncResult | str]:
    """Every working connection, one after another. For a cron job.

    One person's broken mailbox must not stop everyone else's bills, so a
    failure is recorded against them and the loop moves on.
    """
    results: dict[uuid.UUID, SyncResult | str] = {}
    # Ids, not the rows: a failure rolls the session back, which expires every
    # object loaded before it.
    user_ids = [c.user_id for c in GmailConnectionRepository(db).all_working()]
    for user_id in user_ids:
        user = UserRepository(db).get(user_id)
        if user is None:
            continue
        try:
            results[user.id] = sync(db, user)
        except Exception as error:  # noqa: BLE001 -- reported, never swallowed silently
            db.rollback()
            results[user.id] = f"{type(error).__name__}: {error}"
    return results
