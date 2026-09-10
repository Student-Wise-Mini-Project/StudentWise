"""Natural-language query schemas."""

from typing import Any

from pydantic import BaseModel, Field


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=500)


class AskResponse(BaseModel):
    question: str
    # The SQL that ran, shown so the answer can be checked rather than trusted.
    sql: str
    explanation: str
    columns: list[str]
    rows: list[dict[str, Any]]
    row_count: int
    # True when there were more rows than the server will return.
    truncated: bool
