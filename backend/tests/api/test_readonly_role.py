"""The read-only role generated SQL runs as in production (10.6).

Connects as the real role, so what is proven is what Postgres enforces -- not
what our own guard would have refused first.
"""

import secrets

import pytest
from sqlalchemy import create_engine, make_url, text
from sqlalchemy.exc import ProgrammingError

from app.config import settings
from app.domain.sql_guard import ALLOWED_RELATIONS, SCOPE_CTES
from make_readonly_role import USER_COLUMNS, grant_readonly

ROLE = "studentwise_readonly_test"


@pytest.fixture(scope="module")
def as_readonly(engine):
    """A connection logged in as a freshly granted read-only role."""
    password = secrets.token_urlsafe(24)
    with engine.begin() as owner:
        grant_readonly(owner, ROLE, password)
    url = make_url(settings.test_database_url).set(username=ROLE, password=password)
    readonly = create_engine(url)
    with readonly.connect() as connection:
        yield connection
    readonly.dispose()
    with engine.begin() as owner:
        owner.execute(text(f"REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {ROLE}"))
        owner.execute(text(f"REVOKE ALL ON SCHEMA public FROM {ROLE}"))
        database = owner.scalar(text("SELECT current_database()"))
        owner.execute(text(f'REVOKE ALL ON DATABASE "{database}" FROM {ROLE}'))
        owner.execute(text(f"DROP ROLE {ROLE}"))


def refused(connection, sql: str) -> bool:
    try:
        with connection.begin_nested():
            connection.execute(text(sql))
    except ProgrammingError as error:
        return "permission denied" in str(error)
    return False


def test_the_scoping_ctes_run_as_the_role(as_readonly):
    """Everything the Ask path itself reads is granted -- otherwise production
    Ask would fail on the first question."""
    sql = f"WITH {SCOPE_CTES.strip()} SELECT count(*) FROM expenses"
    with as_readonly.begin_nested():
        as_readonly.execute(text(sql), {"group_id": "00000000-0000-0000-0000-000000000000"})


@pytest.mark.parametrize("table", sorted(ALLOWED_RELATIONS - {"users"}))
def test_every_allowed_table_is_readable(as_readonly, table):
    with as_readonly.begin_nested():
        as_readonly.execute(text(f"SELECT * FROM public.{table} LIMIT 1"))


def test_the_password_hash_is_unreadable(as_readonly):
    assert refused(as_readonly, "SELECT password_hash FROM public.users")
    assert refused(as_readonly, "SELECT * FROM public.users")


def test_the_safe_user_columns_are_readable(as_readonly):
    with as_readonly.begin_nested():
        as_readonly.execute(text(f"SELECT {', '.join(USER_COLUMNS)} FROM public.users"))


@pytest.mark.parametrize(
    "table", ["notifications", "gmail_connections", "chat_messages", "receipt_images"]
)
def test_tables_outside_the_guard_are_unreadable(as_readonly, table):
    """Gmail tokens, private chats, receipt photos: none of the model's business."""
    assert refused(as_readonly, f"SELECT 1 FROM public.{table} LIMIT 1")


def test_nothing_can_be_written(as_readonly):
    assert refused(as_readonly, "DELETE FROM public.expenses")
    assert refused(as_readonly, "UPDATE public.groups SET name = 'x'")
