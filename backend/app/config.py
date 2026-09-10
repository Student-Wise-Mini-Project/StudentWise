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
    nl_query_model: str = "claude-opus-5"
    nl_query_row_limit: int = 200
    nl_query_timeout_ms: int = 5000
    # Optional dedicated read-only Postgres role. Defence in depth: the query is
    # already validated and run in a read-only transaction without it.
    readonly_database_url: str | None = None

    # Receipt images. Local disk in dev; swap `LocalReceiptStore` for an object
    # store later without touching anything that reads a receipt.
    receipt_storage_dir: str = "var/receipts"
    receipt_max_bytes: int = 5 * 1024 * 1024  # 5 MB -- a phone photo, not a scan

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
