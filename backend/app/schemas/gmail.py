"""Gmail connection schemas."""

from datetime import datetime

from pydantic import BaseModel


class GmailConnectOut(BaseModel):
    #: Send the browser here. Google asks for read-only access and sends it back
    #: to the callback, which returns it to the app's settings screen.
    authorization_url: str


class GmailStatusOut(BaseModel):
    #: False when the server has no Google client or no encryption key: the
    #: settings screen then explains rather than offering a button that fails.
    available: bool
    connected: bool
    google_email: str | None = None
    connected_at: datetime | None = None
    last_synced_at: datetime | None = None
    #: Google refused the token (revoked, or a 7-day testing-mode expiry).
    needs_reconnect: bool = False


class GmailSyncOut(BaseModel):
    checked: int
    imported: int
    needs_review: int
    skipped: int
    needs_reconnect: bool
