"""Semantic search over a group's expenses, and the chat tool on top (8.3, 8.4).

Voyage is replaced by `ConceptEmbedder`: each word maps to a "concept"
dimension, in either language, so "Italian food" and "פיצה" both land near
"Pizza night" the way a real model would put them -- and the tests can count
exactly what was sent to be embedded.
"""

import json
from datetime import date

import pytest
from sqlalchemy import func, select

from app.ai import chat as chat_model
from app.ai import embeddings
from app.ai.chat import ModelTurn, ToolCall
from app.config import settings
from app.models.expense_embedding import ExpenseEmbedding
from app.services import chat_tools, semantic_search_service

CONCEPTS = {
    "pizza": 0, "italian": 0, "pasta": 0, "פיצה": 0,
    "sushi": 1, "japanese": 1, "fish": 1, "סושי": 1,
    "electricity": 2, "bill": 2, "power": 2, "חשמל": 2,
    "cleaning": 3, "kitchen": 3, "soap": 3, "ניקיון": 3,
}  # fmt: skip


class ConceptEmbedder:
    def __init__(self):
        self.calls: list[tuple[str, list[str]]] = []

    def __call__(self, texts, *, input_type):
        self.calls.append((input_type, list(texts)))
        vectors = []
        for text in texts:
            vector = [0.0] * 5
            for word in text.lower().replace(".", " ").replace(",", " ").split():
                vector[CONCEPTS.get(word, 4)] += 1.0
            vector[4] *= 0.1  # words that mean nothing in particular count for little
            vectors.append(vector)
        return vectors

    def documents(self) -> list[str]:
        return [text for kind, texts in self.calls if kind == "document" for text in texts]


@pytest.fixture
def embedder(monkeypatch):
    fake = ConceptEmbedder()
    monkeypatch.setattr(settings, "voyage_api_key", "test-key")
    monkeypatch.setattr(embeddings, "embed", fake)
    return fake


@pytest.fixture
def flat(client, alice, bob):
    alice_user, headers = alice
    group = client.post(
        "/api/groups", json={"name": "Dizengoff 5", "type": "SHARED_APARTMENT"}, headers=headers
    ).json()
    client.post(
        f"/api/groups/{group['id']}/members", json={"email": "bob@example.com"}, headers=headers
    )

    created = {}
    for title, amount, day, notes in [
        ("Pizza night", "143.50", "2026-10-02", None),
        ("Sushi at Ichi Ban", "218.00", "2026-09-12", None),
        ("Electricity bill", "412.00", "2026-09-03", None),
        ("Shufersal", "64.00", "2026-09-20", "soap and cleaning stuff for the kitchen"),
    ]:
        created[title] = client.post(
            f"/api/groups/{group['id']}/expenses",
            json={
                "title": title,
                "total_amount": amount,
                "expense_date": day,
                "payer_id": alice_user["id"],
                "split_type": "EQUAL",
                "notes": notes,
            },
            headers=headers,
        ).json()
    return {"group": group, "headers": headers, "expenses": created}


def search(db, flat, query, **kwargs):
    from app.models.group import Group

    group = db.get(Group, flat["group"]["id"])
    return [m.expense.title for m in semantic_search_service.search(db, group, query, **kwargs)]


# --- finding by meaning ---------------------------------------------------------------


def test_a_description_finds_the_expense_it_means(db, flat, embedder):
    assert search(db, flat, "that italian place", limit=1) == ["Pizza night"]
    assert search(db, flat, "japanese fish", limit=1) == ["Sushi at Ichi Ban"]


def test_a_hebrew_question_finds_an_english_title(db, flat, embedder):
    assert search(db, flat, "פיצה", limit=1) == ["Pizza night"]


def test_notes_count_as_well_as_titles(db, flat, embedder):
    assert search(db, flat, "kitchen", limit=1) == ["Shufersal"]


def test_dates_narrow_the_search(db, flat, embedder):
    found = search(db, flat, "pizza", date_from=date(2026, 9, 1), date_to=date(2026, 9, 30))
    assert "Pizza night" not in found  # it was in October


def test_another_groups_expenses_are_never_found(client, db, flat, embedder, bob):
    _, bob_headers = bob
    other = client.post(
        "/api/groups", json={"name": "Bob's trip", "type": "TRIP"}, headers=bob_headers
    ).json()
    client.post(
        f"/api/groups/{other['id']}/expenses",
        json={
            "title": "Pasta in Rome",
            "total_amount": "80.00",
            "expense_date": "2026-09-01",
            "payer_id": client.get("/api/auth/me", headers=bob_headers).json()["id"],
            "split_type": "EQUAL",
        },
        headers=bob_headers,
    )
    found = search(db, flat, "pasta", limit=10)
    assert "Pasta in Rome" not in found
    assert all("Rome" not in text for text in embedder.documents())


# --- embeddings are made once, and remade only when needed ---------------------------------


def test_the_first_search_embeds_the_group_and_the_next_only_the_question(db, flat, embedder):
    search(db, flat, "pizza")
    assert len(embedder.documents()) == 4
    assert [kind for kind, _ in embedder.calls] == ["document", "query"]

    search(db, flat, "sushi")
    assert len(embedder.documents()) == 4  # nothing re-embedded
    assert embedder.calls[-1] == ("query", ["sushi"])


def test_editing_a_title_re_embeds_only_that_expense(client, db, flat, embedder):
    search(db, flat, "pizza")
    pizza = flat["expenses"]["Pizza night"]
    client.patch(
        f"/api/expenses/{pizza['id']}", json={"title": "Pasta night"}, headers=flat["headers"]
    )

    search(db, flat, "pasta")
    assert embedder.documents()[4:] == ["Pasta night"]


def test_a_new_model_re_embeds_everything(db, flat, embedder, monkeypatch):
    search(db, flat, "pizza")
    monkeypatch.setattr(settings, "embedding_model", "voyage-4")
    search(db, flat, "pizza")
    assert len(embedder.documents()) == 8
    models = db.scalars(select(ExpenseEmbedding.model)).all()
    assert set(models) == {"voyage-4"}


def test_deleting_an_expense_deletes_its_embedding(client, db, flat, embedder):
    search(db, flat, "pizza")
    pizza = flat["expenses"]["Pizza night"]
    assert client.delete(f"/api/expenses/{pizza['id']}", headers=flat["headers"]).status_code == 204
    assert db.scalar(select(func.count()).select_from(ExpenseEmbedding)) == 3


def test_an_empty_group_needs_no_embedding_at_all(client, db, embedder, alice):
    from app.models.group import Group

    _, headers = alice
    empty = client.post(
        "/api/groups", json={"name": "Empty", "type": "SOLO"}, headers=headers
    ).json()
    assert semantic_search_service.search(db, db.get(Group, empty["id"]), "anything") == []
    assert embedder.calls == []


# --- in the chat ------------------------------------------------------------------------------


def test_without_a_key_the_assistant_is_not_offered_search(monkeypatch):
    monkeypatch.setattr(settings, "voyage_api_key", None)
    assert "search_expenses" not in [tool["name"] for tool in chat_tools.available()]
    monkeypatch.setattr(settings, "voyage_api_key", "k")
    assert "search_expenses" in [tool["name"] for tool in chat_tools.available()]


def test_the_assistant_can_find_an_expense_by_description(client, flat, embedder, monkeypatch):
    sent = []

    def scripted(system, tools, messages):
        sent.append({"tools": [t["name"] for t in tools], "messages": messages[:]})
        if len(sent) == 1:
            return ModelTurn(
                stop_reason="tool_use",
                text="",
                tool_calls=[ToolCall("call_0", "search_expenses", {"query": "italian food"})],
                content=[{"type": "tool_use", "id": "call_0", "name": "search_expenses",
                          "input": {"query": "italian food"}}],
            )  # fmt: skip
        return ModelTurn(stop_reason="end_turn", text="Pizza night, ₪143.50.", content=[])

    monkeypatch.setattr(chat_model, "respond", scripted)
    response = client.post(
        f"/api/groups/{flat['group']['id']}/chat/conversations",
        json={"message": "How much was that Italian place?"},
        headers=flat["headers"],
    )
    assert response.status_code == 201, response.text
    assert "search_expenses" in sent[0]["tools"]

    [result] = sent[1]["messages"][-1]["content"]
    matches = json.loads(result["content"])["matches"]
    assert matches[0]["title"] == "Pizza night"
    assert matches[0]["amount"] == "143.50"
    assert 0 < matches[0]["similarity"] <= 1
    assert set(matches[0]["shared_by"]) == {"Alice", "Bob"}


def test_an_empty_search_goes_back_to_the_model_as_an_error(db, flat, embedder):
    from app.models.group import Group

    context = chat_tools.ToolContext(
        db=db, readonly=None, group=db.get(Group, flat["group"]["id"]), language="en"
    )
    with pytest.raises(chat_tools.ToolError, match="Say what to look for"):
        chat_tools.run(context, "search_expenses", {"query": "  "})


def test_saving_the_same_embedding_twice_replaces_it_rather_than_failing(db, flat):
    # Two first searches at once both find no row and both write it.
    from app.repositories.expense_embedding_repository import ExpenseEmbeddingRepository

    repo = ExpenseEmbeddingRepository(db)
    expense_id = flat["expenses"]["Pizza night"]["id"]
    for text_hash in ("first", "second"):
        repo.save(
            expense_id=expense_id, model="m", text_hash=text_hash, dimensions=2, vector=b"\0" * 8
        )
    rows = db.scalars(select(ExpenseEmbedding)).all()
    assert [(str(r.expense_id), r.text_hash) for r in rows] == [(expense_id, "second")]


def test_when_search_is_down_the_model_is_told_to_use_other_tools(db, flat, monkeypatch):
    from app.core.errors import ServiceUnavailableError
    from app.models.group import Group

    def rate_limited(texts, *, input_type):
        raise ServiceUnavailableError("Search is busy. Try again in a moment.")

    monkeypatch.setattr(settings, "voyage_api_key", "k")
    monkeypatch.setattr(embeddings, "embed", rate_limited)
    context = chat_tools.ToolContext(
        db=db, readonly=None, group=db.get(Group, flat["group"]["id"]), language="en"
    )
    with pytest.raises(chat_tools.ToolError, match="Do not call search_expenses again"):
        chat_tools.run(context, "search_expenses", {"query": "pizza"})
