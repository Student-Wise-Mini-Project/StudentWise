"""Shared pytest fixtures.

Each test runs inside a transaction that is rolled back afterwards, so tests are
isolated even though services call `db.commit()`. `join_transaction_mode` is what
makes that work: the service's commit becomes a savepoint release, not a real commit.
"""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

import app.models  # noqa: F401  -- registers every model on Base.metadata
from app.config import settings
from app.db import Base, get_db
from app.main import app as fastapi_app


@pytest.fixture(scope="session")
def engine() -> Generator[Engine, None, None]:
    eng = create_engine(settings.test_database_url)
    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def db(engine: Engine) -> Generator[Session, None, None]:
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(
        bind=connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db: Session) -> Generator[TestClient, None, None]:
    fastapi_app.dependency_overrides[get_db] = lambda: db
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
