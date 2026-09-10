"""The migrated schema really does allow everything the models allow.

This exists because of a bug that shipped twice without anything noticing.

`Enum(..., native_enum=False)` stores a VARCHAR plus a CHECK listing the allowed
values. Adding a member to the Python enum changes **nothing** about the column
definition, so `alembic revision --autogenerate` emits no operation and
`alembic check` reports a clean tree -- while the database goes on rejecting the
new value. Two enums had drifted that way (`ExpenseSource` gained RECURRING,
`NotificationKind` gained three), and every test passed, because the test schema
used to be built with `create_all` from the models rather than by migrating.

The test schema is now built by running the migrations, which is what makes this
test able to fail at all.
"""

import pytest
from sqlalchemy import Engine, text
from sqlalchemy import Enum as SAEnum

import app.models  # noqa: F401  -- registers every model
from app.db import Base


def varchar_enum_columns():
    """Every VARCHAR-backed enum column in the schema, with its allowed values."""
    for table in Base.metadata.sorted_tables:
        for column in table.columns:
            if isinstance(column.type, SAEnum) and not column.type.native_enum:
                yield table.name, column.name, column.type.name, tuple(column.type.enums)


def test_there_are_enum_columns_to_check():
    """A guard on the guard: if introspection stops finding anything, this file
    would pass by doing nothing at all."""
    found = list(varchar_enum_columns())
    assert len(found) >= 6, found


@pytest.mark.parametrize(
    ("table", "column", "constraint", "values"),
    list(varchar_enum_columns()),
    ids=lambda value: value if isinstance(value, str) else "",
)
def test_the_database_accepts_every_value_the_enum_defines(
    engine: Engine, table, column, constraint, values
):
    with engine.connect() as connection:
        definition = connection.execute(
            text(
                "SELECT pg_get_constraintdef(oid) FROM pg_constraint "
                "WHERE conrelid = :table ::regclass AND conname = :constraint"
            ),
            {"table": table, "constraint": constraint},
        ).scalar()

    assert definition is not None, (
        f"{table}.{column} has no {constraint} constraint in the migrated schema. "
        "Either the migration never created it, or create_constraint was left False."
    )

    missing = [value for value in values if f"'{value}'" not in definition]
    assert not missing, (
        f"{table}.{column} rejects {missing}, which the Python enum allows. "
        "Adding an enum member needs a migration that rewrites the CHECK -- "
        "autogenerate will not write one for you."
    )
