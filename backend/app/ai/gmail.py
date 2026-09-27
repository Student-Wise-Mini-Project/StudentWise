"""Talking to Google: the OAuth consent flow and reading bill emails.

Everything that touches the network is in this module and nothing else, so the
tests replace `authorization_url`, `exchange_code`, `open_mailbox` and `revoke`
and never need a Google account. `message_from_payload` is pure and is tested
directly against Gmail-shaped dictionaries.

The only scope asked for is `gmail.readonly`. It is a *restricted* scope: while
the Google Cloud app is in "Testing" mode, only listed test users can connect,
and their refresh tokens expire after seven days. `GmailAuthError` is how that
expiry reaches the rest of the app, as "connect again".
"""

import base64
import contextlib
import html
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from email.utils import parseaddr
from typing import Any

from app.config import settings
from app.core.errors import ServiceUnavailableError

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
AUTH_URI = "https://accounts.google.com/o/oauth2/auth"
TOKEN_URI = "https://oauth2.googleapis.com/token"
REVOKE_URI = "https://oauth2.googleapis.com/revoke"

#: What a bill can arrive as. Anything else attached is ignored.
BILL_ATTACHMENT_TYPES = {"application/pdf", "image/jpeg", "image/png", "image/webp"}
#: Well past any real bill; stops one huge attachment eating a sync.
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
#: The email text is context for the model, not the document itself.
MAX_TEXT_CHARS = 20_000


class GmailAuthError(Exception):
    """Google refused the stored token: revoked, or expired. Connect again."""


def configured() -> bool:
    return bool(settings.google_client_id and settings.google_client_secret)


def _require_configured() -> None:
    if not configured():
        raise ServiceUnavailableError(
            "Gmail is not configured on this server "
            "(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set)"
        )


def _client_config() -> dict[str, Any]:
    return {
        "web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "auth_uri": AUTH_URI,
            "token_uri": TOKEN_URI,
            "redirect_uris": [settings.google_redirect_uri],
        }
    }


def _flow():
    from google_auth_oauthlib.flow import Flow

    return Flow.from_client_config(
        _client_config(),
        scopes=SCOPES,
        redirect_uri=settings.google_redirect_uri,
        # A confidential client with a secret; PKCE would need the verifier
        # stored between the two requests for no added protection here.
        autogenerate_code_verifier=False,
    )


# --- consent --------------------------------------------------------------------


def authorization_url(state: str) -> str:
    """Where to send the browser to ask for read-only access to Gmail."""
    _require_configured()
    url, _ = _flow().authorization_url(
        # `offline` and `consent` together are what make Google return a
        # refresh token every time, including for someone reconnecting.
        access_type="offline",
        prompt="consent",
        include_granted_scopes="false",
        state=state,
    )
    return url


@dataclass(frozen=True)
class GoogleGrant:
    refresh_token: str
    email: str


def exchange_code(code: str) -> GoogleGrant:
    """Trade the code Google sent back for a refresh token and the mailbox address."""
    _require_configured()
    from googleapiclient.discovery import build

    flow = _flow()
    try:
        flow.fetch_token(code=code)
    except Exception as error:  # oauthlib raises a family of unrelated types
        raise GmailAuthError("Google did not accept the sign-in code") from error

    credentials = flow.credentials
    if not credentials.refresh_token:
        raise GmailAuthError("Google did not return a refresh token")

    service = build("gmail", "v1", credentials=credentials, cache_discovery=False)
    profile = service.users().getProfile(userId="me").execute()
    return GoogleGrant(refresh_token=credentials.refresh_token, email=profile["emailAddress"])


def revoke(refresh_token: str) -> None:
    """Tell Google to forget the grant. Best effort: disconnecting must still
    delete our copy if Google is unreachable or already forgot it."""
    import requests

    with contextlib.suppress(requests.RequestException):
        requests.post(REVOKE_URI, params={"token": refresh_token}, timeout=10)


# --- reading --------------------------------------------------------------------


@dataclass(frozen=True)
class EmailAttachment:
    filename: str
    mime_type: str
    data: bytes


@dataclass(frozen=True)
class EmailMessage:
    id: str
    sender: str
    subject: str
    received_at: datetime | None
    text: str
    attachments: list[EmailAttachment] = field(default_factory=list)


def bill_search_query(*, lookback_days: int, trusted_domains: list[str]) -> str:
    """The Gmail search for bills.

    A bill-like subject, a bill-like attachment name, or a known sender;
    recent only. The filename clause is for a bill forwarded between flatmates
    with no subject at all -- found testing on a real inbox, where the subject
    search missed it. Not every PDF: that pulled in sixteen unrelated emails
    there, each a model call, against one for the filename keywords.
    Not `has:attachment` either: plenty of bills put the amount in the body.
    """
    keywords = "(חשבונית OR חשבון OR קבלה OR לתשלום OR bill OR invoice)"
    filenames = "(bill OR invoice OR חשבון OR חשבונית)"
    senders = " OR ".join(trusted_domains)
    return (
        f"newer_than:{lookback_days}d "
        f"(subject:{keywords} OR filename:{filenames} OR from:({senders}))"
    )


def _b64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


_TAG = re.compile(r"<(script|style)[^>]*>.*?</\1>|<[^>]+>", re.DOTALL | re.IGNORECASE)


def _html_to_text(markup: str) -> str:
    return " ".join(html.unescape(_TAG.sub(" ", markup)).split())


def _header(headers: list[dict[str, str]], name: str) -> str:
    return next((h["value"] for h in headers if h.get("name", "").lower() == name), "")


def message_from_payload(
    raw: dict[str, Any], load_attachment: Callable[[str], bytes]
) -> EmailMessage:
    """A Gmail `messages.get(format="full")` response as something readable.

    Walks the MIME tree once: the first text/plain part wins over text/html,
    and PDF or image attachments are collected, fetched through
    `load_attachment` when Gmail only sent a reference to them.
    """
    payload = raw.get("payload", {})
    headers = payload.get("headers", [])
    plain: list[str] = []
    markup: list[str] = []
    attachments: list[EmailAttachment] = []

    def walk(part: dict[str, Any]) -> None:
        mime = (part.get("mimeType") or "").lower()
        body = part.get("body", {}) or {}
        filename = part.get("filename") or ""

        if mime.startswith("multipart/"):
            for child in part.get("parts", []) or []:
                walk(child)
            return

        if filename or body.get("attachmentId"):
            kind = mime
            if kind == "application/octet-stream" and filename.lower().endswith(".pdf"):
                kind = "application/pdf"
            if kind not in BILL_ATTACHMENT_TYPES or (body.get("size") or 0) > MAX_ATTACHMENT_BYTES:
                return
            data = _b64(body["data"]) if body.get("data") else load_attachment(body["attachmentId"])
            attachments.append(EmailAttachment(filename=filename, mime_type=kind, data=data))
            return

        if body.get("data"):
            text = _b64(body["data"]).decode("utf-8", errors="replace")
            if mime == "text/plain":
                plain.append(text)
            elif mime == "text/html":
                markup.append(text)

    walk(payload)

    text = "\n".join(plain).strip() or _html_to_text("\n".join(markup))
    internal = raw.get("internalDate")
    received = datetime.fromtimestamp(int(internal) / 1000, tz=UTC) if internal else None
    return EmailMessage(
        id=raw["id"],
        sender=parseaddr(_header(headers, "from"))[1] or _header(headers, "from"),
        subject=_header(headers, "subject"),
        received_at=received,
        text=text[:MAX_TEXT_CHARS],
        attachments=attachments,
    )


class Mailbox:
    """One user's Gmail, opened with their refresh token."""

    def __init__(self, refresh_token: str) -> None:
        _require_configured()
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        credentials = Credentials(
            token=None,
            refresh_token=refresh_token,
            token_uri=TOKEN_URI,
            client_id=settings.google_client_id,
            client_secret=settings.google_client_secret,
            scopes=SCOPES,
        )
        self._messages = (
            build("gmail", "v1", credentials=credentials, cache_discovery=False).users().messages()
        )

    def _execute(self, request: Any) -> Any:
        from google.auth.exceptions import RefreshError
        from googleapiclient.errors import HttpError

        try:
            return request.execute()
        except RefreshError as error:
            raise GmailAuthError("Google refused the stored token") from error
        except HttpError as error:
            if error.resp.status in (401, 403):
                raise GmailAuthError("Google refused the stored token") from error
            raise ServiceUnavailableError("Gmail is unavailable right now") from error

    def search(self, query: str, max_results: int) -> list[str]:
        response = self._execute(self._messages.list(userId="me", q=query, maxResults=max_results))
        return [m["id"] for m in response.get("messages", [])]

    def fetch(self, message_id: str) -> EmailMessage:
        raw = self._execute(self._messages.get(userId="me", id=message_id, format="full"))

        def load(attachment_id: str) -> bytes:
            part = self._execute(
                self._messages.attachments().get(
                    userId="me", messageId=message_id, id=attachment_id
                )
            )
            return _b64(part["data"])

        return message_from_payload(raw, load)


def open_mailbox(refresh_token: str) -> Mailbox:
    return Mailbox(refresh_token)
