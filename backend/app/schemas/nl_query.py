"""Natural-language query schemas."""

from typing import Any, Literal

from pydantic import BaseModel, Field


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=500)
    #: The language the app is shown in. The explanation and the column
    #: headings come back in it, whatever language the question was typed in.
    language: Literal["en", "he"] = "en"


class AskResponse(BaseModel):
    question: str
    # The SQL that ran, shown so the answer can be checked rather than trusted.
    sql: str
    explanation: str
    columns: list[str]
    #: Headings for `columns`, in the question's language. A column without
    #: one is shown by its name.
    column_labels: dict[str, str] = {}
    rows: list[dict[str, Any]]
    row_count: int
    # True when there were more rows than the server will return.
    truncated: bool
