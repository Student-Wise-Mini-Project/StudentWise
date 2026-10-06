"""Create the read-only Postgres role that generated SQL runs as (mission 10.6).

    python make_readonly_role.py          # against DATABASE_URL

Prints the READONLY_DATABASE_URL to give the server. Running it again rotates
the password, so the old URL stops working.

Generated SQL -- the Ask screen and the chat's database tool -- is already
validated, scoped to one group and run in a READ ONLY transaction. This role is
the layer underneath: even a query that got past all three can read only the
tables the guard allows, cannot read `users.password_hash` at all, and cannot
write anything, because Postgres itself refuses.
"""

import secrets

from sqlalchemy import Connection, create_engine, make_url, text

from app.config import settings
from app.domain.sql_guard import ALLOWED_RELATIONS

ROLE = "studentwise_readonly"

#: The columns the `users` scoping CTE selects -- everything except the
#: password hash. Granted per column, so the hash is unreadable by this role
#: even with SELECT * FROM public.users.
USER_COLUMNS = ("id", "name", "email", "phone_number", "created_at")


def grant_readonly(connection: Connection, role: str, password: str) -> None:
    """Create (or reset) `role` with SELECT on the allowed relations only."""
    exists = connection.scalar(text("SELECT 1 FROM pg_roles WHERE rolname = :r"), {"r": role})
    # Identifiers and the password cannot be bound parameters in DDL. The role
    # name is a constant of ours and the password is token_urlsafe output
    # ([A-Za-z0-9_-]), so neither can carry a quote.
    verb = "ALTER" if exists else "CREATE"
    connection.execute(text(f"{verb} ROLE {role} WITH LOGIN PASSWORD '{password}'"))

    database = connection.scalar(text("SELECT current_database()"))
    connection.execute(text(f'GRANT CONNECT ON DATABASE "{database}" TO {role}'))
    connection.execute(text(f"GRANT USAGE ON SCHEMA public TO {role}"))
    # Start from nothing, so a grant removed here is removed there too.
    connection.execute(text(f"REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {role}"))
    for table in sorted(ALLOWED_RELATIONS - {"users"}):
        connection.execute(text(f"GRANT SELECT ON public.{table} TO {role}"))
    columns = ", ".join(USER_COLUMNS)
    connection.execute(text(f"GRANT SELECT ({columns}) ON public.users TO {role}"))


def main() -> None:
    password = secrets.token_urlsafe(24)
    engine = create_engine(settings.database_url)
    with engine.begin() as connection:
        grant_readonly(connection, ROLE, password)
    readonly = make_url(settings.database_url).set(username=ROLE, password=password)
    print(f"READONLY_DATABASE_URL={readonly.render_as_string(hide_password=False)}")


if __name__ == "__main__":
    main()
