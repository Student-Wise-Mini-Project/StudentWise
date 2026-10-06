"""Application settings, loaded from environment / .env."""

from decimal import Decimal
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://studentwise:studentwise@localhost:5434/studentwise"
    test_database_url: str = (
        "postgresql+psycopg://studentwise:studentwise@localhost:5434/studentwise_test"
    )

    jwt_secret: str = "dev-secret-change-me-before-deploying-anywhere"  # >=32 bytes for HS256
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

    # Optional dedicated read-only Postgres role. Defence in depth: the query is
    # already validated and run in a read-only transaction without it.
    readonly_database_url: str | None = None

    # Receipt images. Local disk in dev; swap `LocalReceiptStore` for an object
    # store later without touching anything that reads a receipt.
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

    # Vite dev server and CRA dev server, for the frontend teammate.
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
    ]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
