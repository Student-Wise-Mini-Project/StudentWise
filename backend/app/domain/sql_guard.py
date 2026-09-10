"""The security boundary for natural-language querying.

Pure functions: SQL text in, safe SQL text out or an exception. No database, no
network, no LLM.

## The threat

A language model writes this SQL, and the model has been fed user-controlled
text -- expense titles, group names, someone's display name. Treat every query
reaching this module as hostile. The model is not a trusted component; it is an
input.

## How the group scope is enforced

Not by asking the model nicely. `wrap_in_group_scope` prepends a set of CTEs
that shadow the real tables with group-filtered versions:

    WITH expenses AS (SELECT * FROM public.expenses WHERE group_id = :group_id),
         ...
    <the model's SELECT>

A bare `expenses` in the model's query resolves to that CTE, so scoping holds by
construction even if the model forgets it entirely. That is also why
schema-qualified names are refused: `public.expenses` would skip the CTE and
reach every group's data.

The `users` CTE lists columns explicitly and omits `password_hash`, so the
column is unreachable rather than merely discouraged.

## Layers

1. This validator (AST-based, not regex -- comments and whitespace cannot smuggle
   anything past a real parser).
2. Scoping CTEs, injected server-side; the model never supplies the group id.
3. A read-only transaction with a statement timeout, and a row cap.
4. Optionally a dedicated read-only Postgres role with column-level grants.

Any one of these failing should still leave the system safe.
"""

import sqlglot
from sqlglot import expressions as exp
from sqlglot.errors import ParseError

DIALECT = "postgres"

#: Logical relation names the model may query. Each is shadowed by a
#: group-scoped CTE injected by `wrap_in_group_scope`.
ALLOWED_RELATIONS = frozenset(
    {
        "users",
        "groups",
        "group_members",
        "expenses",
        "expense_splits",
        "settlements",
    }
)

#: Never reachable, and asking for it is a red flag worth failing loudly on.
FORBIDDEN_COLUMNS = frozenset({"password_hash"})

#: Functions that read files, reach the network, stall the connection or leak
#: server configuration.
FORBIDDEN_FUNCTIONS = frozenset(
    {
        "pg_sleep",
        "pg_read_file",
        "pg_read_binary_file",
        "pg_ls_dir",
        "pg_stat_file",
        "lo_import",
        "lo_export",
        "dblink",
        "dblink_connect",
        "dblink_exec",
        "query_to_xml",
        "database_to_xml",
        "current_setting",
        "set_config",
        "pg_terminate_backend",
        "pg_cancel_backend",
        "txid_current",
        "pg_client_encoding",
        "inet_server_addr",
        "inet_client_addr",
    }
)


#: Any of these appearing anywhere in the tree means the query writes or
#: changes something, even when a SELECT sits at the root.
_WRITE_NODE_NAMES = (
    "Insert",
    "Update",
    "Delete",
    "Merge",
    "Drop",
    "Create",
    "Alter",
    "Grant",
    "Revoke",
    "TruncateTable",
    "Copy",
    "Command",
    "Transaction",
    "Commit",
    "Rollback",
    "Set",
    "Use",
    "AlterTable",
)
# Resolved by name so a sqlglot version that renames or drops one of these does
# not break the import -- the guard just checks the types that exist.
_WRITE_NODES = tuple(
    getattr(exp, name) for name in _WRITE_NODE_NAMES if isinstance(getattr(exp, name, None), type)
)


class UnsafeSqlError(Exception):
    """The generated SQL was refused. The message is safe to show a user."""


def _fail(reason: str) -> None:
    raise UnsafeSqlError(reason)


def _parse_single_statement(sql: str) -> exp.Expression:
    if not sql or not sql.strip():
        _fail("The query was empty")

    try:
        statements = [s for s in sqlglot.parse(sql, dialect=DIALECT) if s is not None]
    except ParseError as error:
        raise UnsafeSqlError("The query could not be parsed as SQL") from error

    if not statements:
        _fail("The query was empty")
    if len(statements) > 1:
        # Comments and whitespace cannot hide a second statement from a real
        # parser, which is why this is not a regex.
        _fail("Only a single statement is allowed")
    return statements[0]


def _check_is_select(statement: exp.Expression) -> None:
    if not isinstance(statement, exp.Select | exp.Union):
        _fail("Only SELECT queries are allowed")

    # Checking the root alone is not enough. Postgres allows data-modifying
    # CTEs -- `WITH x AS (INSERT ... RETURNING *) SELECT * FROM x` has a SELECT
    # at the root and still writes to the database. So sweep the whole tree.
    for node in statement.walk():
        if isinstance(node, _WRITE_NODES):
            _fail(f"Only read-only SELECT queries are allowed (found {type(node).__name__})")

    if statement.find(exp.Into) is not None:
        _fail("SELECT ... INTO is not allowed")

    if statement.find(exp.Lock) is not None:
        _fail("Locking clauses are not allowed")

    for table in statement.find_all(exp.Table):
        # ONLY addresses a physical table's own rows, which is an attempt to
        # reach past the scoping CTE that shadows it.
        if table.args.get("only"):
            _fail("ONLY is not allowed")


def _declared_cte_names(statement: exp.Expression) -> set[str]:
    return {cte.alias_or_name.lower() for cte in statement.find_all(exp.CTE)}


def _check_tables(statement: exp.Expression) -> None:
    allowed = ALLOWED_RELATIONS | _declared_cte_names(statement)

    for table in statement.find_all(exp.Table):
        if table.db or table.catalog:
            # Would bypass the scoping CTEs entirely.
            _fail(f"Schema-qualified names are not allowed: {table.sql(dialect=DIALECT)}")

        name = table.name.lower()
        if name not in allowed:
            _fail(f"Unknown or forbidden table: {table.name}")


def _check_columns(statement: exp.Expression) -> None:
    for column in statement.find_all(exp.Column):
        if column.name.lower() in FORBIDDEN_COLUMNS:
            _fail(f"Column is not accessible: {column.name}")

    for identifier in statement.find_all(exp.Identifier):
        if identifier.name.lower() in FORBIDDEN_COLUMNS:
            _fail(f"Column is not accessible: {identifier.name}")


def _check_functions(statement: exp.Expression) -> None:
    for function in statement.find_all(exp.Func):
        name = function.sql_name().lower() if hasattr(function, "sql_name") else ""
        if isinstance(function, exp.Anonymous):
            name = str(function.this).lower()
        if name in FORBIDDEN_FUNCTIONS:
            _fail(f"Function is not allowed: {name}")


def validate_select(sql: str) -> str:
    """Return the SQL, normalised, or raise UnsafeSqlError.

    Refuses anything that is not a single read-only SELECT over the allowed
    relations.
    """
    statement = _parse_single_statement(sql)
    _check_is_select(statement)
    _check_tables(statement)
    _check_columns(statement)
    _check_functions(statement)
    return statement.sql(dialect=DIALECT)


#: Group-scoped views of the real tables. The model's query references bare
#: names, which resolve to these, so it cannot reach another group's rows even
#: if it omits every filter. `users` lists its columns explicitly: password_hash
#: is absent, so it is unreachable rather than merely discouraged.
SCOPE_CTES = """
users AS (
    SELECT u.id, u.name, u.email, u.phone_number, u.created_at
    FROM public.users u
    WHERE u.id IN (
        SELECT gm.user_id FROM public.group_members gm WHERE gm.group_id = :group_id
    )
),
groups AS (
    SELECT * FROM public.groups WHERE id = :group_id
),
group_members AS (
    SELECT * FROM public.group_members WHERE group_id = :group_id
),
expenses AS (
    SELECT * FROM public.expenses WHERE group_id = :group_id
),
expense_splits AS (
    SELECT s.* FROM public.expense_splits s
    JOIN public.expenses e ON e.id = s.expense_id
    WHERE e.group_id = :group_id
),
settlements AS (
    SELECT * FROM public.settlements WHERE group_id = :group_id
)
"""


def wrap_in_group_scope(validated_sql: str, *, row_limit: int) -> str:
    """Wrap already-validated SQL so it can only see one group's data.

    The model's query becomes a subquery beneath our CTEs, so it needs no
    knowledge of the group at all -- `:group_id` is bound server-side by the
    caller and never appears in anything the model produced.

    Pass only SQL that `validate_select` has returned.
    """
    if not isinstance(row_limit, int) or row_limit <= 0:
        raise ValueError("row_limit must be a positive integer")

    inner = validated_sql.rstrip().rstrip(";")
    return f"WITH {SCOPE_CTES.strip()}\nSELECT * FROM (\n{inner}\n) AS nl_result\nLIMIT {row_limit}"
