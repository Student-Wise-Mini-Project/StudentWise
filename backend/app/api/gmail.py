"""Connecting Gmail, and pulling bills out of it.

The callback is the one route here without a bearer token: Google sends the
browser to it, and a browser redirect cannot carry an Authorization header.
It is authenticated by the signed, short-lived `state` minted for the user who
asked to connect instead.
"""

from fastapi import APIRouter, Query, status
from fastapi.responses import RedirectResponse

from app.ai import gmail
from app.config import settings
from app.core import crypto
from app.core.deps import CurrentUser, DbSession
from app.core.errors import AppError
from app.schemas.gmail import GmailConnectOut, GmailStatusOut, GmailSyncOut
from app.services import gmail_service

router = APIRouter(prefix="/integrations/gmail", tags=["gmail"])


@router.get("", response_model=GmailStatusOut)
def get_status(current_user: CurrentUser, db: DbSession) -> GmailStatusOut:
    available = gmail.configured() and crypto.encryption_configured()
    connection = gmail_service.get_connection(db, current_user)
    if connection is None:
        return GmailStatusOut(available=available, connected=False)
    return GmailStatusOut(
        available=available,
        connected=True,
        google_email=connection.google_email,
        connected_at=connection.connected_at,
        last_synced_at=connection.last_synced_at,
        needs_reconnect=connection.needs_reconnect,
    )


@router.post("/connect", response_model=GmailConnectOut)
def connect(current_user: CurrentUser) -> GmailConnectOut:
    """The address of Google's consent page. Only read access is asked for."""
    return GmailConnectOut(authorization_url=gmail_service.connect_url(current_user))


@router.get("/callback", include_in_schema=False)
def callback(
    db: DbSession,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
) -> RedirectResponse:
    """Where Google sends the browser back. Always ends on the settings screen,
    with a result the screen can explain -- never a JSON error in a bare tab."""
    target = f"{settings.frontend_url.rstrip('/')}/settings"
    if error or not code or not state:
        outcome = "denied" if error == "access_denied" else "failed"
        return RedirectResponse(f"{target}?gmail={outcome}", status_code=status.HTTP_303_SEE_OTHER)
    try:
        gmail_service.complete_connection(db, code=code, state=state)
    except AppError:
        return RedirectResponse(f"{target}?gmail=failed", status_code=status.HTTP_303_SEE_OTHER)
    return RedirectResponse(f"{target}?gmail=connected", status_code=status.HTTP_303_SEE_OTHER)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def disconnect(current_user: CurrentUser, db: DbSession) -> None:
    """Revoke the grant at Google and forget it. Bills already imported stay."""
    gmail_service.disconnect(db, current_user)


@router.post("/sync", response_model=GmailSyncOut)
def sync(current_user: CurrentUser, db: DbSession) -> GmailSyncOut:
    """Look for new bills now. Safe to call repeatedly: an email is read once.

    Bills from a known utility for a flat that is certain are split straight
    away; everything else waits in `GET /bills`.
    """
    result = gmail_service.sync(db, current_user)
    return GmailSyncOut(**result.__dict__)
