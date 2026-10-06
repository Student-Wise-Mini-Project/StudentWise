# Semantic search for the money assistant

**Date:** 2026-10-06
**Branch:** `feat/semantic-search`
**Missions:** 8.3 (vector store) and 8.4 (RAG). Built by #3; reviewed by the
parallel session studentwise-d0.

## What was built

- `expense_embeddings`: one vector per expense, cascading with it.
  Migration `8564366d2686` follows deployment's `0fb83f8aa324`.
- `app/ai/embeddings.py`: Voyage AI over plain HTTPS, using
  `voyage-4-lite` with `input_type` set to query or document. It is one
  function, and the tests replace it.
- `domain/vector_search.py`: cosine similarity in an exact FAISS index,
  built in memory for each search. FAISS is imported lazily.
- `services/semantic_search_service.py`: embeds stale texts lazily, then
  ranks the group's expenses, with optional date filters.
- A `search_expenses` tool for the assistant, offered only when
  `VOYAGE_API_KEY` is set.
- Tests: 7 unit tests and 15 API tests, using a "concept" embedder whose
  similarity is predictable.

## Decisions

- **Lazy, never on the write path.** Saving an expense never calls Voyage.
  The first search in a group embeds the whole group; after that, an
  expense is embedded again only when its text or the embedding model
  changes (`text_hash`, `model`).
- **The vectors live in Postgres, and the index lives in memory.** Deployed
  containers lose their disk on every restart. An exact index over a few
  hundred vectors takes microseconds, so there is no index file to keep in
  sync. A numpy dot product would rank them identically; FAISS was kept
  because the roadmap named it. Deployment measured 213 MB peak against the
  512 MB plan.
- **Upsert, not merge** (from d0's review). Two people searching a group
  for the first time at the same moment must not race into a primary-key
  error.
- **When search fails, the model is told to use the other tools.** Live,
  a rate-limited search said "try again", so the model retried five times
  and gave up on the whole answer.
- **Privacy.** Titles and notes go to Voyage, a third party. Voyage may
  train on API inputs unless the dashboard opt-out is on, and the opt-out
  only covers what is sent after it is switched on. This is documented in
  `.env.example` and the API contract. The team's account opted out on
  2026-10-06, after the live tests.

## Tested live

5/5 answers had the right amount, across three groups and in both
languages:

- "that Italian food night" found "Pizza night"
- "המלון בצפון" found "Hotel in Haifa"
- "המסיבה בברגהיין" found "Berghain…", and noticed that Hila was not on it

**Known slip:** one Hebrew answer guessed a gender ("הילה לא נכנסה"),
despite the prompt rule.

## Cost

Voyage limits an account without a payment method to 3 requests a minute.
Lifting the limit needs a one-off $5 credit purchase, with auto-recharge
left off. That is $5 of the $20 project budget.

## Surprises

- "Add a payment method" was not free: Voyage requires a minimum $5 credit
  purchase. The session had said it would cost nothing until the free tokens
  ran out, which was wrong and was corrected before Dana paid.
