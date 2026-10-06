"""Finding expenses by what they were, not what they were called (8.3, 8.4).

"That Italian place in October" has no word in common with "Pizza night", and
"פיצה" none with either. Each expense's text is embedded by Voyage AI, the
question is embedded the same way, and FAISS ranks the expenses by how close
they are. The money assistant offers this as a tool, which is the retrieval
half of retrieval-augmented generation: Claude reads the matches and answers.

Text-to-SQL still answers anything numerical better -- this is for fuzzy
recall over titles and notes, where an exact query cannot help.

Embeddings are made lazily, when a group is searched: saving an expense never
waits on, or fails because of, a third-party API. The first search in a group
embeds all of it in one or two requests; after that only new or edited
expenses are sent. Owns its transaction: the vectors it makes are committed so
the next search does not make them again.
"""

import hashlib
from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.ai import embeddings
from app.config import settings
from app.core.errors import BadRequestError
from app.domain import vector_search
from app.models.expense import Expense
from app.models.group import Group
from app.repositories.expense_embedding_repository import ExpenseEmbeddingRepository

MAX_RESULTS = 25


@dataclass(frozen=True)
class Match:
    expense: Expense
    #: Cosine similarity, -1 to 1.
    score: float


def expense_text(expense: Expense) -> str:
    """What an expense is about, in words. Amounts and dates are left out: they
    are filters, not meaning, and would pull unrelated expenses together."""
    parts = [expense.title]
    if expense.category:
        parts.append(expense.category.value.replace("_", " ").lower())
    if expense.notes:
        parts.append(expense.notes)
    return ". ".join(part.strip() for part in parts if part and part.strip())


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _refresh(db: Session, group: Group) -> list[tuple[Expense, list[float]]]:
    """Every expense in the group with an up-to-date vector, embedding what is missing."""
    repo = ExpenseEmbeddingRepository(db)
    rows = repo.for_group(group.id)
    model = settings.embedding_model

    stale = [
        (expense, expense_text(expense))
        for expense, embedding in rows
        if embedding is None
        or embedding.model != model
        or embedding.text_hash != _hash(expense_text(expense))
    ]
    fresh: dict = {}
    if stale:
        vectors = embeddings.embed([text for _, text in stale], input_type="document")
        for (expense, text), vector in zip(stale, vectors, strict=True):
            repo.save(
                expense_id=expense.id,
                model=model,
                text_hash=_hash(text),
                dimensions=len(vector),
                vector=vector_search.to_bytes(vector),
            )
            fresh[expense.id] = vector
        # Committed here, inside whatever called the search -- the chat's tool
        # loop, today. That is safe only because the chat writes nothing until
        # its answer exists; chat_service says so where the loop starts.
        db.commit()

    return [
        (expense, fresh.get(expense.id) or vector_search.from_bytes(embedding.vector))
        for expense, embedding in rows
    ]


def search(
    db: Session,
    group: Group,
    query: str,
    *,
    limit: int = 10,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[Match]:
    """The expenses closest in meaning to `query`, best first."""
    query = query.strip()
    if not query:
        raise BadRequestError("Say what to look for")
    limit = max(1, min(limit, MAX_RESULTS))

    candidates = [
        (expense, vector)
        for expense, vector in _refresh(db, group)
        if (date_from is None or expense.expense_date >= date_from)
        and (date_to is None or expense.expense_date <= date_to)
    ]
    if not candidates:
        return []

    [query_vector] = embeddings.embed([query], input_type="query")
    hits = vector_search.rank(query_vector, [vector for _, vector in candidates], limit=limit)
    return [Match(expense=candidates[hit.index][0], score=hit.score) for hit in hits]
