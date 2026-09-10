# StudentWise — Working Rules

Expense-splitting app (Splitwise/Tricount style) with AI features layered on top.
Team of 3. Backend first, step by step: **Step 1 = DB + Auth + CRUD**, Step 2 =
algorithms (balances, min-cash-flow), Step 3+ = AI.

## Stack

| Layer | Choice |
|---|---|
| Python | **3.12** (`py -3.12`). Not 3.14 — `psycopg-binary` has no `cp314` wheel yet. |
| Deps | `venv` + `pip` + `requirements.txt`. No poetry, no uv. |
| Web | FastAPI + uvicorn |
| ORM | SQLAlchemy 2.0, **sync** (not async) + `psycopg[binary]` |
| Migrations | Alembic |
| Validation | Pydantic v2 + pydantic-settings |
| Auth | PyJWT + `pwdlib[argon2]` |
| Tests | pytest + FastAPI TestClient |
| Lint | ruff (lint + format). No mypy, no pre-commit hooks. |
| DB | Postgres 16 via `docker compose up -d` |

## Architecture — four layers, nothing more

> **api/** does HTTP: parse, validate, call a service, return a schema. No SQL.
> **services/** holds business rules and **owns the transaction** — services commit.
> Raise from `core/errors.py`, never `HTTPException` directly.
> **repositories/** builds queries and adds/flushes objects. **Never commits.**
> No abstract base classes, no interfaces, no generic `BaseRepository[T]`.
> **domain/** is pure math: takes numbers, returns numbers. No DB, no FastAPI.
> Nothing imports "upward".

Resist adding layers beyond these four.

**The rule that keeps it safe: repositories never call `db.commit()`.** If they do,
you get half-written expenses with no splits.

## Hard rules

1. **Money is always `Decimal` / `NUMERIC(12,2)`. Never `float`.** Not in models, not
   in schemas, not in tests.
2. **One file per entity, in every layer.** `expenses.py` in `api/`, `services/`,
   `repositories/`, `models/`, `schemas/`. Three people edit different entities
   without touching the same file.
3. **No native Postgres ENUM types.** Use `Enum(SomeEnum, native_enum=False)` →
   VARCHAR + CHECK, with Python-side enum safety. `ALTER TYPE ... ADD VALUE` is a
   migration headache and these enums will grow.
4. **Currency lives on the group, never on the expense.** No FX, no mixed-currency
   balances.
5. **Hard delete, not soft delete.** Deleting an expense deletes it; splits cascade.
6. **Every schema change gets an Alembic migration** in the same commit as the model.
7. **Every new endpoint gets a test** in `tests/api/`.
8. **List endpoints return `Page[T]`, never a bare array.**
   `{items, total, limit, offset, has_more}` — `total` counts what matches the
   filters, ignoring limit/offset. Build the page and the count from the *same*
   filter helper; a total that disagrees with its page is worse than no total.
9. **`created_at` uses `clock_timestamp()`, not `now()`.** `now()` is the
   transaction's start time, so several rows written in one transaction share it
   exactly and anything ordered by it falls into an arbitrary order. Order by a
   second column too, so a pager cannot repeat or skip a row.

## Commands

```powershell
docker compose up -d                  # start Postgres (host port 5434)
alembic upgrade head                  # apply migrations (run from backend/)
uvicorn app.main:app --reload         # run the API
pytest                                # run tests
pytest tests/unit -q                  # fast: pure logic only
ruff check --fix . ; ruff format .    # lint + format
alembic revision --autogenerate -m "add expenses"   # new migration
```

## Git

- `main` is protected **by convention, not by GitHub** — rulesets need a paid
  plan on a private repo. See `.github/branch-protection.md`; the rule is
  written and ready to apply. Never push to `main` directly.
- Branch per milestone: `feat/expenses-crud`.
- PR → one teammate approves → squash-merge.
- CI runs `ruff check` + `pytest`.

## Ownership (so we don't collide)

- **Gal** — `models/`, `repositories/`, `services/`, `domain/`, migrations. The core.
- **Teammate 2** — `app/ai/` package + `api/ai.py` (OCR, voice, Text-to-SQL,
  anomalies). Calls `expense_service` functions; never touches models or repositories.
- **Teammate 3** — `frontend/`. Builds against `docs/api-contract.md` and `/docs`.

## End of session

Write a summary to `docs/sessions/YYYY-MM-DD-<topic>.md`: what was built, what
decisions were made and why, what's next, anything that surprised us.

## Domain notes

- `expense_splits` is how "only some of the group is on this expense" works — a row
  exists only for a participant.
- `Expense_Items` / `Item_Splits` arrive in Step 3 (per-item receipt splitting) and
  will **compute and write `expense_splits` rows**. Balances and analytics must never
  learn that items exist.
- Splitting arithmetic lives in `domain/splitting.py` and uses the largest-remainder
  method so `100/3` gives `33.34 / 33.33 / 33.33`, never `99.99`.
- **Notifications fan out on write.** `notification_service.record_*` is called
  *by another service, inside its transaction*, and never commits — an expense
  and the notifications about it land together or not at all. Everything else in
  that module owns its own transaction.
- **Notification wording is never stored.** A row keeps `kind` plus a `payload`
  of plain facts; `render()` turns that into words at read time, so the app can
  be shown in Hebrew without a migration.
- **Uploaded bytes decide what a file is, not its `Content-Type`.** Receipt
  storage keys are generated from the expense UUID and re-checked against a
  pattern before they become a path — nothing a user typed reaches the
  filesystem. See `core/storage.py`.
