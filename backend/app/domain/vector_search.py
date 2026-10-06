"""Ranking vectors by similarity (mission 8.3). Pure: numbers in, numbers out.

Cosine similarity, computed as an inner product over normalised vectors in a
FAISS flat index. Exact rather than approximate on purpose: one group has at
most a few hundred expenses, so an exact search over all of them is
microseconds, and an approximate index would trade correctness for speed this
data does not need.

The index is built per search, in memory, from vectors stored in Postgres. It
is never saved: a container restart loses nothing, and there is no file to go
stale when an expense is edited.

FAISS is imported inside `rank`, so a server that never searches never loads it.
"""

from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class Hit:
    #: Position in the `candidates` list given to `rank`.
    index: int
    #: Cosine similarity, -1 to 1. Higher is closer.
    score: float


def _normalised(vectors: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    # A zero vector matches nothing rather than dividing by zero.
    norms[norms == 0] = 1.0
    return vectors / norms


def rank(query: Sequence[float], candidates: Sequence[Sequence[float]], *, limit: int) -> list[Hit]:
    """The `limit` candidates most similar to `query`, best first."""
    if not candidates or limit <= 0:
        return []

    import faiss

    matrix = _normalised(np.asarray(candidates, dtype=np.float32))
    if matrix.shape[1] != len(query):
        raise ValueError(f"query has {len(query)} dimensions, candidates have {matrix.shape[1]}")

    index = faiss.IndexFlatIP(matrix.shape[1])
    index.add(matrix)
    scores, positions = index.search(
        _normalised(np.asarray([query], dtype=np.float32)), min(limit, len(candidates))
    )
    return [
        Hit(index=int(position), score=round(float(score), 4))
        for position, score in zip(positions[0], scores[0], strict=True)
        if position >= 0
    ]


def to_bytes(vector: Sequence[float]) -> bytes:
    return np.asarray(vector, dtype="<f4").tobytes()


def from_bytes(data: bytes) -> list[float]:
    return np.frombuffer(data, dtype="<f4").tolist()
