"""Production settings (missions 10.2, 10.5, 10.6).

The point of production mode is that a server with a laptop-only setting does
not start. Every refusal here is one that would otherwise have been found by
someone forging a token, or by receipts vanishing after a redeploy.
"""

import pytest
from cryptography.fernet import Fernet
from pydantic import ValidationError

from app.config import DEV_JWT_SECRET, Settings

STRONG_SECRET = "x" * 48


def make(**overrides) -> Settings:
    """Settings from these values only -- never from a developer's .env."""
    return Settings(_env_file=None, **overrides)


def production(**overrides) -> Settings:
    return make(environment="production", jwt_secret=STRONG_SECRET, **overrides)


def refusal(**overrides) -> str:
    with pytest.raises(ValidationError) as caught:
        make(environment="production", **overrides)
    return str(caught.value)


# --- 10.2: the database URL is pasted as the host gives it -------------------


@pytest.mark.parametrize(
    "given",
    [
        "postgresql://u:p@ep-cool-1.eu-central-1.aws.neon.tech/neondb?sslmode=require",
        "postgres://u:p@ep-cool-1.eu-central-1.aws.neon.tech/neondb?sslmode=require",
        "postgresql+psycopg://u:p@ep-cool-1.eu-central-1.aws.neon.tech/neondb?sslmode=require",
    ],
)
def test_a_hosted_postgres_url_is_used_with_psycopg(given):
    settings = make(database_url=given)
    assert settings.database_url == (
        "postgresql+psycopg://u:p@ep-cool-1.eu-central-1.aws.neon.tech/neondb?sslmode=require"
    )


def test_the_readonly_url_is_rewritten_too():
    settings = make(readonly_database_url="postgresql://ro:p@host/db")
    assert settings.readonly_database_url == "postgresql+psycopg://ro:p@host/db"


# --- 10.5: secrets -----------------------------------------------------------


def test_development_starts_with_the_dev_secret():
    assert make(jwt_secret=DEV_JWT_SECRET).environment == "development"


def test_production_refuses_the_committed_jwt_secret():
    assert "JWT_SECRET is the development secret" in refusal(jwt_secret=DEV_JWT_SECRET)


def test_production_refuses_a_short_jwt_secret():
    assert "shorter than 32 bytes" in refusal(jwt_secret="too-short")


def test_production_starts_with_a_real_secret():
    assert production().jwt_secret == STRONG_SECRET


def test_a_malformed_encryption_key_is_refused():
    assert "not a Fernet key" in refusal(jwt_secret=STRONG_SECRET, token_encryption_key="nope")


def test_gmail_without_an_encryption_key_is_refused():
    message = refusal(
        jwt_secret=STRONG_SECRET,
        public_url="https://studentwise.onrender.com",
        google_client_id="id",
        google_client_secret="secret",
    )
    assert "TOKEN_ENCRYPTION_KEY is not" in message


def test_every_problem_is_reported_at_once():
    """One redeploy per mistake is how a deploy eats an evening."""
    message = refusal(jwt_secret=DEV_JWT_SECRET, cors_origins=["*"], google_client_id="id")
    assert "JWT_SECRET" in message
    assert "CORS_ORIGINS" in message
    assert "GOOGLE_CLIENT_SECRET" in message


# --- 10.6: origins, HTTPS, storage ------------------------------------------


def test_production_needs_no_cors_grant():
    """The frontend is served from the API's own origin."""
    assert production().cors_origins == []


def test_development_keeps_the_vite_origin():
    assert "http://localhost:5173" in make().cors_origins


def test_a_wildcard_origin_is_refused():
    assert 'contains "*"' in refusal(jwt_secret=STRONG_SECRET, cors_origins=["*"])


def test_a_plain_http_origin_is_refused():
    message = refusal(jwt_secret=STRONG_SECRET, cors_origins=["http://studentwise.example"])
    assert "is not https" in message


def test_a_plain_http_public_url_is_refused():
    assert "is not https" in refusal(jwt_secret=STRONG_SECRET, public_url="http://example.com")


def test_production_keeps_receipts_in_the_database():
    """A free host's disk is wiped on every deploy."""
    assert production().receipt_storage == "database"
    assert make().receipt_storage == "local"


def test_receipts_on_disk_can_still_be_chosen_explicitly():
    assert production(receipt_storage="local").receipt_storage == "local"


# --- one address, derived everywhere ----------------------------------------


def test_the_gmail_urls_follow_the_public_url():
    settings = production(public_url="https://studentwise.onrender.com/")
    assert settings.public_url == "https://studentwise.onrender.com"
    assert settings.frontend_url == "https://studentwise.onrender.com"
    assert settings.google_redirect_uri == (
        "https://studentwise.onrender.com/api/integrations/gmail/callback"
    )


def test_render_supplies_the_public_url(monkeypatch):
    monkeypatch.setenv("RENDER_EXTERNAL_URL", "https://studentwise.onrender.com")
    assert make().public_url == "https://studentwise.onrender.com"


def test_an_explicit_redirect_wins_over_the_derived_one():
    settings = production(
        public_url="https://studentwise.onrender.com",
        google_redirect_uri="https://studentwise.example/api/integrations/gmail/callback",
    )
    assert settings.google_redirect_uri.startswith("https://studentwise.example")


def test_gmail_cannot_redirect_a_production_server_to_a_laptop():
    """The default redirect is the Vite dev port. Left unchanged in production,
    Google would send every user to localhost after they approve."""
    message = refusal(
        jwt_secret=STRONG_SECRET,
        google_client_id="id",
        google_client_secret="secret",
        token_encryption_key=Fernet.generate_key().decode(),
    )
    assert "set PUBLIC_URL" in message


def test_a_production_image_can_be_tried_on_localhost():
    """The same image, run locally before deploying, must start."""
    settings = production(
        public_url="http://localhost:8000",
        google_client_id="id",
        google_client_secret="secret",
        token_encryption_key=Fernet.generate_key().decode(),
    )
    assert settings.google_redirect_uri == "http://localhost:8000/api/integrations/gmail/callback"


def test_a_refusal_never_prints_the_values_it_was_given():
    """The message lands in the host's deploy log, which more people can read
    than the secrets it would otherwise contain."""
    message = refusal(
        jwt_secret="short",
        database_url="postgresql://neon:hunter2-db-password@ep-x.neon.tech/neondb",
        anthropic_api_key="sk-ant-do-not-print-me",
    )
    assert "hunter2" not in message
    assert "sk-ant" not in message
