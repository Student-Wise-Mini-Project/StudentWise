"""Shared pytest fixtures.

Each test runs inside a transaction that is rolled back afterwards, so tests are
isolated even though services call `db.commit()`. `join_transaction_mode` is what
makes that work: the service's commit becomes a savepoint release, not a real commit.
"""

from collections.abc import Generator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Connection, Engine, create_engine, text
from sqlalchemy.orm import Session

import app.models  # noqa: F401  -- registers every model on Base.metadata
from app.config import settings
from app.db import get_db, get_readonly_connection
from app.main import app as fastapi_app

BACKEND_ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="session")
def engine() -> Generator[Engine, None, None]:
    """The test database, built by running the migrations.

    Not `Base.metadata.create_all`, which is faster and lies. The two schemas
    are not the same thing: a VARCHAR enum CHECK constraint is rebuilt from the
    model by `create_all` but is only widened by a migration somebody remembered
    to write, and `alembic check` does not notice the difference. Building the
    test schema the way production is built means a migration nobody wrote is a
    failing test rather than a 500 after deploying.
    """
    eng = create_engine(settings.test_database_url)
    with eng.begin() as connection:
        connection.execute(text("DROP SCHEMA public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))

    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    config.set_main_option("sqlalchemy.url", settings.test_database_url.replace("%", "%%"))
    command.upgrade(config, "head")

    yield eng
    eng.dispose()


@pytest.fixture
def connection(engine: Engine) -> Generator[Connection, None, None]:
    """One connection per test, in a transaction that is always rolled back."""
    conn = engine.connect()
    transaction = conn.begin()
    try:
        yield conn
    finally:
        transaction.rollback()
        conn.close()


@pytest.fixture
def db(connection: Connection) -> Generator[Session, None, None]:
    session = Session(
        bind=connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db: Session, connection: Connection) -> Generator[TestClient, None, None]:
    fastapi_app.dependency_overrides[get_db] = lambda: db
    # Generated SQL runs on the test's own connection so it can see data the
    # test has written but not committed. In production this dependency opens a
    # separate READ ONLY transaction.
    fastapi_app.dependency_overrides[get_readonly_connection] = lambda: connection
    with TestClient(fastapi_app) as test_client:
        yield test_client
    fastapi_app.dependency_overrides.clear()


@pytest.fixture
def make_user(client: TestClient):
    """Register a user and return (user_dict, auth_headers)."""

    def _make(email: str = "alice@example.com", name: str = "Alice", password: str = "password123"):
        response = client.post(
            "/api/auth/register",
            json={"name": name, "email": email, "password": password},
        )
        assert response.status_code == 201, response.text
        body = response.json()
        headers = {"Authorization": f"Bearer {body['access_token']}"}
        return body["user"], headers

    return _make


@pytest.fixture
def alice(make_user):
    return make_user(email="alice@example.com", name="Alice")


@pytest.fixture
def bob(make_user):
    return make_user(email="bob@example.com", name="Bob")
