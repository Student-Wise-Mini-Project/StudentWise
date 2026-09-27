"""Connecting and disconnecting Gmail.

Google is stubbed: `authorization_url` and `exchange_code` are replaced, so
these run with no Google account and no network. What they prove is ours to
get right -- that the answer from Google is tied to the user who asked, that
the token is never stored in the clear, and that the OAuth state can never be
used to sign in.
"""

from urllib.parse import parse_qs, urlparse

import jwt
import pytest
from cryptography.fernet import Fernet

from app.ai import gmail
from app.ai.gmail import GmailAuthError, GoogleGrant
from app.config import settings
from app.models.gmail_connection import GmailConnection

REFRESH_TOKEN = "1//refresh-token-that-reads-a-whole-mailbox"


@pytest.fixture
def google(monkeypatch):
    """Configure the server for Gmail and replace every call to Google."""
    monkeypatch.setattr(settings, "google_client_id", "client-id")
    monkeypatch.setattr(settings, "google_client_secret", "client-secret")
    monkeypatch.setattr(settings, "token_encryption_key", Fernet.generate_key().decode())
    monkeypatch.setattr(settings, "frontend_url", "http://app.test")

    calls = {"exchanged": [], "revoked": []}

    monkeypatch.setattr(
        gmail, "authorization_url", lambda state: f"https://accounts.google.test/auth?state={state}"
    )

    def exchange(code):
        if code == "bad":
            raise GmailAuthError("Google did not accept the sign-in code")
        calls["exchanged"].append(code)
        return GoogleGrant(refresh_token=REFRESH_TOKEN, email="alice.home@gmail.com")

    monkeypatch.setattr(gmail, "exchange_code", exchange)
    monkeypatch.setattr(gmail, "revoke", lambda token: calls["revoked"].append(token))
    return calls


def start(client, headers):
    response = client.post("/api/integrations/gmail/connect", headers=headers)
    assert response.status_code == 200, response.text
    url = response.json()["authorization_url"]
    return parse_qs(urlparse(url).query)["state"][0]


def callback(client, **params):
    return client.get("/api/integrations/gmail/callback", params=params, follow_redirects=False)


def connect(client, headers, code="good"):
    return callback(client, code=code, state=start(client, headers))


def status(client, headers):
    return client.get("/api/integrations/gmail", headers=headers).json()


# --- the happy path --------------------------------------------------------------


def test_connecting_stores_the_mailbox_and_lands_on_settings(client, alice, google):
    _, headers = alice
    response = connect(client, headers)

    assert response.status_code == 303
    assert response.headers["location"] == "http://app.test/settings?gmail=connected"
    body = status(client, headers)
    assert body["connected"] is True
    assert body["google_email"] == "alice.home@gmail.com"
    assert body["needs_reconnect"] is False


def test_the_refresh_token_is_never_stored_in_the_clear(client, alice, google, db):
    _, headers = alice
    connect(client, headers)
    stored = db.query(GmailConnection).one()
    assert REFRESH_TOKEN not in stored.refresh_token_encrypted
    # ...and is not in any response either.
    assert REFRESH_TOKEN not in str(status(client, headers))


def test_reconnecting_replaces_the_token_rather_than_adding_a_second(client, alice, google, db):
    _, headers = alice
    connect(client, headers)
    connect(client, headers)
    assert db.query(GmailConnection).count() == 1


# --- the state ------------------------------------------------------------------


def test_the_answer_is_tied_to_whoever_asked(client, alice, bob, google):
    _, alice_headers = alice
    _, bob_headers = bob
    connect(client, alice_headers)
    assert status(client, alice_headers)["connected"] is True
    assert status(client, bob_headers)["connected"] is False


@pytest.mark.parametrize("state", ["", "not-a-jwt", "a.b.c"])
def test_a_forged_state_is_refused(client, google, state):
    response = callback(client, code="good", state=state)
    assert response.headers["location"].endswith("gmail=failed")
    assert google["exchanged"] == []


def test_a_login_token_cannot_be_used_as_a_state(client, alice, google):
    _, headers = alice
    login_token = headers["Authorization"].removeprefix("Bearer ")
    response = callback(client, code="good", state=login_token)
    assert response.headers["location"].endswith("gmail=failed")


def test_a_state_cannot_be_used_to_sign_in(client, alice, google):
    _, headers = alice
    state = start(client, headers)
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {state}"})
    assert me.status_code == 401


def test_an_expired_state_is_refused(client, alice, google):
    _, headers = alice
    state = start(client, headers)
    claims = jwt.decode(state, options={"verify_signature": False})
    claims["exp"] = claims["iat"] - 60
    expired = jwt.encode(claims, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    assert callback(client, code="good", state=expired).headers["location"].endswith("failed")


def test_connecting_from_the_sign_up_step_comes_back_home(client, alice, google):
    _, headers = alice
    response = client.post(
        "/api/integrations/gmail/connect", params={"return_to": "home"}, headers=headers
    )
    state = parse_qs(urlparse(response.json()["authorization_url"]).query)["state"][0]
    back = callback(client, code="good", state=state)
    assert back.headers["location"] == "http://app.test/?gmail=connected"


def test_a_failure_from_the_sign_up_step_also_comes_back_home(client, alice, google):
    _, headers = alice
    response = client.post(
        "/api/integrations/gmail/connect", params={"return_to": "home"}, headers=headers
    )
    state = parse_qs(urlparse(response.json()["authorization_url"]).query)["state"][0]
    back = callback(client, code="bad", state=state)
    assert back.headers["location"] == "http://app.test/?gmail=failed"


def test_the_return_page_is_a_name_from_a_fixed_list_not_a_url(client, alice, google):
    _, headers = alice
    response = client.post(
        "/api/integrations/gmail/connect",
        params={"return_to": "https://evil.example"},
        headers=headers,
    )
    assert response.status_code == 422


def test_saying_no_at_google_is_reported_as_such(client, google):
    response = callback(client, error="access_denied")
    assert response.headers["location"] == "http://app.test/settings?gmail=denied"


def test_a_code_google_rejects_is_a_failure_not_a_500(client, alice, google):
    _, headers = alice
    assert connect(client, headers, code="bad").headers["location"].endswith("gmail=failed")


# --- disconnecting and configuration ------------------------------------------------


def test_disconnecting_revokes_at_google_and_forgets_the_token(client, alice, google, db):
    _, headers = alice
    connect(client, headers)
    response = client.delete("/api/integrations/gmail", headers=headers)
    assert response.status_code == 204
    assert google["revoked"] == [REFRESH_TOKEN]
    assert db.query(GmailConnection).count() == 0
    assert status(client, headers)["connected"] is False


def test_disconnecting_when_not_connected_is_a_404(client, alice, google):
    _, headers = alice
    assert client.delete("/api/integrations/gmail", headers=headers).status_code == 404


def test_without_google_configured_the_screen_is_told_and_connect_is_a_503(
    client, alice, monkeypatch
):
    _, headers = alice
    monkeypatch.setattr(settings, "google_client_id", None)
    assert status(client, headers)["available"] is False
    assert client.post("/api/integrations/gmail/connect", headers=headers).status_code == 503


def test_without_an_encryption_key_nothing_can_be_connected(client, alice, google, monkeypatch):
    _, headers = alice
    monkeypatch.setattr(settings, "token_encryption_key", None)
    assert client.post("/api/integrations/gmail/connect", headers=headers).status_code == 503


def test_connecting_needs_a_signed_in_user(client, google):
    assert client.post("/api/integrations/gmail/connect").status_code == 401
