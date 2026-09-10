"""Executes generated SQL. Read-only by construction, and never commits.

Deliberately separate from every other repository: this is the only place in the
codebase that runs SQL it did not write itself, so the constraints live in one
readable function.
"""

import datetime
import decimal
import uuid
from typing import Any

from sqlalchemy import Connection, text


#: Rows are serialised to JSON, so anything the API layer cannot encode is
#: converted here rather than blowing up during response serialisation.
def _to_json_safe(value: Any) -> Any:
    if value is None or isinstance(value, str | bool | int):
        return value
    if isinstance(value, decimal.Decimal):
        # Money stays a string, exactly as everywhere else in this API.
        return str(value)
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime.datetime | datetime.date | datetime.time):
        return value.isoformat()
    if isinstance(value, float):
        return value
    if isinstance(value, list | tuple):
        return [_to_json_safe(item) for item in value]
    if isinstance(value, dict):
        return {str(k): _to_json_safe(v) for k, v in value.items()}
    return str(value)


def run_scoped_query(
    connection: Connection,
    scoped_sql: str,
    group_id: uuid.UUID,
) -> tuple[list[str], list[dict[str, Any]]]:
    """Run wrapped, validated SQL against one group's data.

    The connection arrives already marked READ ONLY with a statement timeout
    (see `get_readonly_connection`), so Postgres refuses any write whatever the
    validator missed. `group_id` is bound as a parameter here and nowhere else --
    it is never part of any text the model produced.
    """
    result = connection.execute(text(scoped_sql), {"group_id": group_id})
    columns = list(result.keys())
    rows = [
        {column: _to_json_safe(value) for column, value in zip(columns, row, strict=True)}
        for row in result.fetchall()
    ]
    return columns, rows
