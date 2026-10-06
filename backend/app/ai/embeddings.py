"""Text embeddings from Voyage AI, for semantic search (mission 8.3).

Anthropic does not make an embedding model; Voyage is the one its own
documentation points to. A plain HTTPS call rather than another SDK: it is one
endpoint, and `requests` is already a dependency.

Behind one function the tests replace -- no test needs a key or a network.
"""

from typing import Literal

import requests

from app.config import settings
from app.core.errors import ServiceUnavailableError

ENDPOINT = "https://api.voyageai.com/v1/embeddings"
#: Voyage takes up to 1,000 texts a request; expense titles are short, so a
#: smaller batch keeps one slow request from holding up a whole answer.
BATCH = 128


def configured() -> bool:
    return bool(settings.voyage_api_key)


def embed(texts: list[str], *, input_type: Literal["query", "document"]) -> list[list[float]]:
    """One vector per text, in order. Separated so tests can replace it.

    `input_type` matters: Voyage frames a query and a document differently, and
    matching a query against documents is what search does.
    """
    if not configured():
        raise ServiceUnavailableError(
            "Semantic search is not configured on this server (VOYAGE_API_KEY is not set)"
        )

    vectors: list[list[float]] = []
    for start in range(0, len(texts), BATCH):
        batch = texts[start : start + BATCH]
        try:
            response = requests.post(
                ENDPOINT,
                headers={"Authorization": f"Bearer {settings.voyage_api_key}"},
                json={"input": batch, "model": settings.embedding_model, "input_type": input_type},
                timeout=settings.embedding_timeout_seconds,
            )
        except requests.RequestException as error:
            raise ServiceUnavailableError("Search is unavailable right now.") from error
        if response.status_code == 429:
            raise ServiceUnavailableError("Search is busy. Try again in a moment.")
        if response.status_code >= 400:
            raise ServiceUnavailableError("Search is unavailable right now.")

        data = sorted(response.json()["data"], key=lambda item: item["index"])
        vectors.extend(item["embedding"] for item in data)
    return vectors
