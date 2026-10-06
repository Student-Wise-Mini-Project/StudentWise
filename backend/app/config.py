"""Application settings, loaded from environment / .env."""

from decimal import Decimal
from functools import lru_cache
from typing import Literal, Self
from urllib.parse import urlsplit

from cryptography.fernet import Fernet
from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

#: Committed in `.env.example`, so anyone who has read the repo can sign a token
#: for any account with it. Fine on a laptop; refused in production.
DEV_JWT_SECRET = "dev-secret-change-me-before-deploying-anywhere"


def _sqlalchemy_url(url: str) -> str:
    """Accept the URL a Postgres host hands out, as it hands it out.

    Neon, Supabase and Render all give `postgresql://` (Heroku-style hosts give
    `postgres://`), and SQLAlchemy reads either as "use psycopg2" -- which is
    not installed. Rewriting the scheme here means the connection string is
    pasted exactly as copied, `?sslmode=require` and all.
    """
    for scheme in ("postgres://", "postgresql://"):
        if url.startswith(scheme):
            return "postgresql+psycopg://" + url.removeprefix(scheme)
    return url


def _is_local(url: str) -> bool:
    return urlsplit(url).hostname in {"localhost", "127.0.0.1"}


class Settings(BaseSettings):
    # populate_by_name so a field with an env alias (public_url) can still be
    # set by its own name in tests. hide_input_in_errors because a settings
    # error is printed to the host's deploy log, and pydantic would otherwise
    # echo every value it was given -- the database password and API keys
    # included.
    model_config = SettingsConfigDict(
        env_file=".env", extra="ignore", populate_by_name=True, hide_input_in_errors=True
    )

    # "production" turns development conveniences off and refuses to start on a
    # setting that is only safe on a laptop. A server that will not boot says
    # what is wrong in the deploy log; one that boots with the committed JWT
    # secret says nothing at all.
    environment: Literal["development", "production"] = "development"

    # The address people open, e.g. https://studentwise.onrender.com. Render
    # sets RENDER_EXTERNAL_URL itself, so there it needs no configuring. The
    # Gmail redirect and the post-connect landing page are derived from it
    # unless set explicitly.
    public_url: str | None = Field(
        default=None, validation_alias=AliasChoices("PUBLIC_URL", "RENDER_EXTERNAL_URL")
    )

    # The built frontend (`frontend/dist`). When set, the API serves it too, so
    # the app and its API share one origin -- which the frontend assumes: it
    # calls `/api` on its own host, and the service worker caches by that path.
    frontend_dist_dir: str | None = None

    database_url: str = "postgresql+psycopg://studentwise:studentwise@localhost:5434/studentwise"
    test_database_url: str = (
        "postgresql+psycopg://studentwise:studentwise@localhost:5434/studentwise_test"
    )

    jwt_secret: str = DEV_JWT_SECRET  # >=32 bytes for HS256
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # one week

    # Natural-language querying. Without a key the /ask endpoint returns 503
    # and everything else in the app carries on working.
    anthropic_api_key: str | None = None
    nl_query_model: str = "claude-sonnet-5"
    nl_query_row_limit: int = 200
    nl_query_timeout_ms: int = 5000
    # The money assistant (Epic 8). Same key; without it the chat returns 503.
    chat_model: str = "claude-sonnet-5"
    # A person is waiting on a phone, through several tool calls.
    chat_timeout_seconds: float = 60.0
    # Model calls in one answer. Each round can call several tools at once, so
    # a real question rarely needs more than three; this stops a loop.
    chat_max_rounds: int = 6
    # Earlier messages sent with each new question. Answers re-fetch their
    # numbers, so older context is only needed for follow-ups like "and Noa?".
    chat_history_messages: int = 20

    # Semantic search over expenses (8.3, 8.4): "that Italian place". Voyage AI
    # makes the embeddings; without a key the chat simply does not offer the
    # search, and everything else works.
    voyage_api_key: str | None = None
    embedding_model: str = "voyage-4-lite"
    embedding_timeout_seconds: float = 20.0

    # Optional dedicated read-only Postgres role. Defence in depth: the query is
    # already validated and run in a read-only transaction without it.
    readonly_database_url: str | None = None

    # Receipt images. Local disk in development. "database" keeps them in
    # Postgres, for a host whose disk is wiped on every restart -- which is
    # every free one. Production defaults to "database"; see `_production`.
    receipt_storage: Literal["local", "database"] = "local"
    receipt_storage_dir: str = "var/receipts"
    receipt_max_bytes: int = 5 * 1024 * 1024  # 5 MB -- a phone photo, not a scan

    # Reading a receipt photo. Uses the same ANTHROPIC_API_KEY as /ask; without
    # it the scan endpoint returns 503 and manual entry is unaffected.
    receipt_ocr_model: str = "claude-sonnet-5"
    # A person is waiting on a phone. Past this, typing it in is faster.
    receipt_ocr_timeout_seconds: float = 90.0

    # Gmail bill ingestion. Without a Google client the Gmail endpoints return
    # 503; without an encryption key nothing is connected, because a refresh
    # token that can read someone's whole mailbox is never stored in the clear.
    google_client_id: str | None = None
    google_client_secret: str | None = None
    # Must be registered in the Google Cloud console exactly as written. In
    # development it goes through the Vite proxy, so it is the frontend's port.
    google_redirect_uri: str = "http://localhost:5173/api/integrations/gmail/callback"
    # Where the browser lands after connecting.
    frontend_url: str = "http://localhost:5173"
    # A Fernet key: `python -c "from cryptography.fernet import Fernet;
    # print(Fernet.generate_key().decode())"`.
    token_encryption_key: str | None = None
    bill_parser_model: str = "claude-sonnet-5"
    gmail_lookback_days: int = 45
    # Each email is one model call, and someone is usually waiting. The rest
    # are picked up by the next sync.
    gmail_max_messages_per_sync: int = 10
    # Bills from these senders may be split without anybody checking first.
    # Everything else waits for review: anyone can email "לתשלום ₪2,000".
    bill_trusted_sender_domains: list[str] = [
        "iec.co.il",  # Israel Electric
        "mei-avivim.co.il",  # water, Tel Aviv
        "hagihon.co.il",  # water, Jerusalem
        "tel-aviv.gov.il",  # arnona, Tel Aviv
        "jerusalem.muni.il",  # arnona, Jerusalem
        "haifa.muni.il",  # arnona, Haifa
        "bezeq.co.il",
        "hot.net.il",
        "partner.co.il",
        "cellcom.co.il",
        "amisragas.co.il",
        "supergas.co.il",
        "pazgas.co.il",
    ]
    # rapidfuzz score (0-100) a flat's address must reach, and how far ahead of
    # the next flat it must be, before a bill is assigned by address alone.
    bill_address_match_threshold: int = 85
    bill_address_match_margin: int = 10

    # Warn once a budget reaches this share of its limit. 0.8 leaves enough
    # month to do something about it; 0.95 does not.
    budget_warning_threshold: Decimal = Decimal("0.80")

    # Vite dev server and CRA dev server, for the frontend teammate. Production
    # serves the frontend from the API's own origin and needs none; see
    # `_production`.
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
    ]

    @field_validator("database_url", "test_database_url", "readonly_database_url")
    @classmethod
    def _psycopg_scheme(cls, url: str | None) -> str | None:
        return None if url is None else _sqlalchemy_url(url)

    @model_validator(mode="after")
    def _derived_urls(self) -> Self:
        if self.public_url:
            self.public_url = self.public_url.rstrip("/")
            if "frontend_url" not in self.model_fields_set:
                self.frontend_url = self.public_url
            if "google_redirect_uri" not in self.model_fields_set:
                self.google_redirect_uri = f"{self.public_url}/api/integrations/gmail/callback"
        return self

    @model_validator(mode="after")
    def _production(self) -> Self:
        """Production defaults, then a refusal to start on anything unsafe.

        Every problem is reported at once: a deploy that fails one setting at a
        time costs one redeploy per mistake.
        """
        if self.environment != "production":
            return self

        # Same origin as the frontend, so no browser needs a CORS grant -- and
        # a free host's disk does not survive a restart.
        if "cors_origins" not in self.model_fields_set:
            self.cors_origins = []
        if "receipt_storage" not in self.model_fields_set:
            self.receipt_storage = "database"

        problems = production_problems(self)
        if problems:
            raise ValueError(
                "Refusing to start in production:\n" + "\n".join(f"  - {p}" for p in problems)
            )
        return self


def production_problems(s: Settings) -> list[str]:
    """Everything about these settings that is only safe on a laptop."""
    problems: list[str] = []

    if s.jwt_secret == DEV_JWT_SECRET:
        problems.append(
            "JWT_SECRET is the development secret committed to the repo -- anyone could "
            "forge a token for any account. Generate one: python make_secrets.py"
        )
    elif len(s.jwt_secret.encode()) < 32:
        problems.append("JWT_SECRET is shorter than 32 bytes, too short for HS256")

    if "*" in s.cors_origins:
        problems.append('CORS_ORIGINS contains "*", which would let any website call the API')
    problems += [
        f"CORS origin {origin} is not https"
        for origin in s.cors_origins
        if origin != "*" and not origin.startswith("https://") and not _is_local(origin)
    ]

    if s.public_url and not s.public_url.startswith("https://") and not _is_local(s.public_url):
        problems.append(f"PUBLIC_URL {s.public_url} is not https")

    if s.token_encryption_key:
        try:
            Fernet(s.token_encryption_key)
        except ValueError:
            problems.append(
                "TOKEN_ENCRYPTION_KEY is not a Fernet key. Generate one: python make_secrets.py"
            )
    if s.google_client_id:
        if not s.google_client_secret:
            problems.append("GOOGLE_CLIENT_ID is set but GOOGLE_CLIENT_SECRET is not")
        if not s.token_encryption_key:
            problems.append(
                "GOOGLE_CLIENT_ID is set but TOKEN_ENCRYPTION_KEY is not, so nobody could "
                "connect Gmail"
            )
        # Local only when the whole app is: a production server sending Google's
        # redirect to the developer's Vite port is the default nobody changed.
        redirect = s.google_redirect_uri
        app_is_local = s.public_url is not None and _is_local(s.public_url)
        if not redirect.startswith("https://") and not (_is_local(redirect) and app_is_local):
            problems.append(
                f"GOOGLE_REDIRECT_URI {redirect} is not this app over https; set PUBLIC_URL"
            )

    return problems


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
