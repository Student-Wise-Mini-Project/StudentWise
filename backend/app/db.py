"""Database engine, session factory and the declarative base."""

from collections.abc import Generator

from sqlalchemy import Connection, Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
_readonly_engine: Engine | None = None

# expire_on_commit=False so ORM objects stay usable after the service commits —
# otherwise every response serialization would trigger a fresh SELECT.
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Declarative base. Every model inherits from this."""


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: one session per request.

    A request that raises rolls back explicitly rather than relying on `close()`
    to do it. Things now depend on that rollback: an idempotency key is claimed
    inside the transaction it protects, so a rejected request has to release its
    key rather than burn it, and a caller who fixes a typo and sends again must
    not be told the key is spent.
    """
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def readonly_engine() -> Engine:
    """Engine for natural-language queries.

    Uses the dedicated read-only role when one is configured, otherwise the
    normal URL. Either way the query runs inside a READ ONLY transaction with a
    statement timeout, so the role is defence in depth rather than the only
    thing standing between a generated query and a write.
    """
    global _readonly_engine
    if _readonly_engine is None:
        url = settings.readonly_database_url or settings.database_url
        _readonly_engine = create_engine(url, pool_pre_ping=True, pool_size=2, max_overflow=2)
    return _readonly_engine


def get_readonly_connection() -> Generator[Connection, None, None]:
    """Connection for running generated SQL.

    A FastAPI dependency, so tests can point it at their own transaction the
    same way they override `get_db`. In production it opens its own connection,
    marks the transaction READ ONLY and sets a statement timeout, then always
    rolls back -- generated SQL never commits anything.
    """
    connection = readonly_engine().connect()
    transaction = connection.begin()
    try:
        connection.exec_driver_sql("SET TRANSACTION READ ONLY")
        connection.exec_driver_sql(
            f"SET LOCAL statement_timeout = {int(settings.nl_query_timeout_ms)}"
        )
        yield connection
    finally:
        transaction.rollback()
        connection.close()
