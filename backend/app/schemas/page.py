"""The shape every paged list endpoint returns.

A bare JSON array cannot say how many rows exist beyond the page, so a client
has no way to draw "showing 50 of 214" or decide whether to render a next
button. `total` is the count *after* filters and *before* limit/offset, which is
what a pager actually needs.
"""

from pydantic import BaseModel, computed_field


class Page[T](BaseModel):
    items: list[T]
    #: Rows matching the filters, ignoring limit and offset.
    total: int
    limit: int
    offset: int

    @computed_field  # type: ignore[prop-decorator]
    @property
    def has_more(self) -> bool:
        return self.offset + len(self.items) < self.total
