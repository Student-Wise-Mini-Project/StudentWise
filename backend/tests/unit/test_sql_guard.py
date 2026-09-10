"""Tests for the SQL guard.

This is the security boundary of the natural-language query feature. Everything
here is an attack the guard has to refuse, or a legitimate query it must not
break. Assume the SQL is hostile: it is written by a language model that has
been fed user-controlled text (expense titles, group names).
"""

import pytest

from app.domain.sql_guard import ALLOWED_RELATIONS, UnsafeSqlError, validate_select


def ok(sql: str) -> str:
    return validate_select(sql)


def rejected(sql: str):
    with pytest.raises(UnsafeSqlError):
        validate_select(sql)


# --- what must be allowed ------------------------------------------------


def test_a_plain_select():
    ok("SELECT title, total_amount FROM expenses")


def test_aggregates_and_grouping():
    ok("SELECT category, SUM(total_amount) FROM expenses GROUP BY category ORDER BY 2 DESC")


def test_joins_across_allowed_relations():
    ok(
        "SELECT u.name, SUM(s.owed_amount) "
        "FROM expense_splits s JOIN users u ON u.id = s.user_id "
        "GROUP BY u.name"
    )


def test_the_model_may_define_its_own_ctes():
    ok(
        "WITH monthly AS (SELECT date_trunc('month', expense_date) AS m, SUM(total_amount) AS t "
        "FROM expenses GROUP BY 1) SELECT * FROM monthly ORDER BY m"
    )


def test_subqueries():
    ok("SELECT * FROM expenses WHERE total_amount > (SELECT AVG(total_amount) FROM expenses)")


def test_window_functions():
    ok("SELECT title, SUM(total_amount) OVER (PARTITION BY category) FROM expenses")


def test_every_allowed_relation_is_queryable():
    for relation in ALLOWED_RELATIONS:
        ok(f"SELECT * FROM {relation}")


def test_a_union_of_allowed_relations():
    ok("SELECT title FROM expenses UNION ALL SELECT name FROM users")


# --- statement type ------------------------------------------------------


@pytest.mark.parametrize(
    "sql",
    [
        "INSERT INTO expenses (title) VALUES ('x')",
        "UPDATE expenses SET total_amount = 0",
        "DELETE FROM expenses",
        "DROP TABLE users",
        "ALTER TABLE users DROP COLUMN email",
        "TRUNCATE users",
        "CREATE TABLE evil (id int)",
        "GRANT ALL ON users TO PUBLIC",
        "COPY users TO '/tmp/out.csv'",
    ],
)
def test_anything_that_is_not_a_select_is_rejected(sql: str):
    rejected(sql)


def test_stacked_statements_are_rejected():
    """The classic: a harmless SELECT with something nasty appended."""
    rejected("SELECT 1; DROP TABLE users")
    rejected("SELECT * FROM expenses; DELETE FROM settlements")


def test_a_trailing_semicolon_is_fine():
    ok("SELECT title FROM expenses;")


def test_select_into_is_rejected():
    """SELECT ... INTO creates a table -- it is a write in disguise."""
    rejected("SELECT * INTO evil FROM expenses")


def test_locking_clauses_are_rejected():
    rejected("SELECT * FROM expenses FOR UPDATE")


def test_empty_or_unparseable_input_is_rejected():
    rejected("")
    rejected("   ")
    rejected("this is not sql at all !!!")


# --- escaping the group scope -------------------------------------------


def test_schema_qualified_names_are_rejected():
    """The whole scoping model rests on bare names resolving to our injected
    CTEs. `public.expenses` would reach the real table and every other group's
    data with it."""
    rejected("SELECT * FROM public.expenses")
    rejected("SELECT * FROM public.users")


def test_catalog_access_is_rejected():
    rejected("SELECT * FROM pg_catalog.pg_user")
    rejected("SELECT * FROM information_schema.tables")
    rejected("SELECT * FROM pg_shadow")


def test_unknown_tables_are_rejected():
    rejected("SELECT * FROM alembic_version")
    rejected("SELECT * FROM some_other_table")


# --- secrets -------------------------------------------------------------


def test_password_hash_is_refused_by_name():
    """Belt and braces: the injected users CTE does not expose the column at
    all, but a query that reaches for it is a red flag worth failing loudly."""
    rejected("SELECT password_hash FROM users")
    rejected("SELECT u.password_hash FROM users u")
    rejected("SELECT name FROM users WHERE password_hash LIKE 'a%'")


# --- dangerous functions -------------------------------------------------


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT pg_sleep(30)",
        "SELECT pg_read_file('/etc/passwd')",
        "SELECT pg_ls_dir('/')",
        "SELECT dblink('...', 'SELECT 1')",
        "SELECT lo_import('/etc/passwd')",
        "SELECT query_to_xml('SELECT 1', true, true, '')",
        "SELECT current_setting('is_superuser')",
        "SELECT pg_read_binary_file('/etc/passwd')",
    ],
)
def test_dangerous_functions_are_rejected(sql: str):
    rejected(sql)


def test_ordinary_functions_are_fine():
    ok("SELECT SUM(total_amount), COUNT(*), AVG(total_amount) FROM expenses")
    ok("SELECT date_trunc('month', expense_date), COALESCE(category, 'OTHER') FROM expenses")
    ok("SELECT UPPER(title), LENGTH(title) FROM expenses")


# --- the returned value --------------------------------------------------


def test_validation_returns_the_normalised_sql():
    result = ok("select   title  from expenses")
    assert "expenses" in result.lower()
    assert result.strip()


def test_comments_do_not_smuggle_anything_past_the_parser():
    rejected("SELECT 1 /* */ ; DROP TABLE users")


# --- regressions ---------------------------------------------------------
#
# Each of these was allowed by an earlier version of the guard. They are the
# reason the guard walks the whole tree instead of inspecting only the root.


@pytest.mark.parametrize(
    "sql",
    [
        "WITH x AS (INSERT INTO expenses (title) VALUES ('e') RETURNING *) SELECT * FROM x",
        "WITH x AS (DELETE FROM settlements RETURNING *) SELECT * FROM x",
        "WITH x AS (UPDATE expenses SET total_amount = 0 RETURNING *) SELECT * FROM x",
        "WITH a AS (SELECT 1), b AS (DELETE FROM expenses RETURNING *) SELECT * FROM a",
    ],
)
def test_data_modifying_ctes_are_rejected(sql: str):
    """Postgres lets a CTE write. Such a query has a SELECT at its root and
    still changes the database, so checking only the root node is not enough."""
    rejected(sql)


def test_only_modifier_is_rejected():
    """ONLY addresses a physical table's own rows, reaching past the scoping
    CTE that shadows it."""
    rejected("SELECT * FROM ONLY expenses")


def test_quoted_schema_qualification_is_rejected():
    rejected('SELECT * FROM "public"."expenses"')


def test_uppercase_schema_qualification_is_rejected():
    rejected("SELECT * FROM PUBLIC.EXPENSES")


def test_schema_qualified_function_is_rejected():
    rejected("SELECT pg_catalog.pg_sleep(30)")


def test_a_cte_may_not_shadow_a_real_table_to_reach_it():
    rejected("WITH expenses AS (SELECT * FROM public.expenses) SELECT * FROM expenses")


def test_quoted_forbidden_column_is_rejected():
    rejected('SELECT "password_hash" FROM users')
