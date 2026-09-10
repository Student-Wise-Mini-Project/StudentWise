# 2026-09-10 — Backend Step 1: DB, Auth, CRUD

Built the backend from an empty folder to a working, tested API. Eight milestones,
six commits, 98 tests passing.

## What exists now

- **Stack**: FastAPI + SQLAlchemy 2.0 (sync) + Alembic + Postgres 16 (Docker), pytest, ruff.
- **Six tables**: `users`, `groups`, `group_members`, `expenses`, `expense_splits`, `settlements`.
- **22 endpoints** under `/api` — auth, user search, groups, members, expenses, settlements.
- **Documented contract** in `docs/api-contract.md`, plus live OpenAPI at `/docs`.
- **Seed data**: `python seed.py` builds a three-person flat with all four split types.
- **CI**: GitHub Action running ruff, `alembic check`, and pytest against a Postgres service.

## Decisions worth remembering

**Python 3.12, not 3.14.** Verified on PyPI: `psycopg-binary` 3.3.5 publishes wheels
for cp310–cp313 only. On 3.14, pip would compile psycopg from C source, which needs
MSVC Build Tools and libpq on every Windows laptop. Revisit when cp314 wheels ship.

**A thin repository layer, but no ceremony around it.** Concrete classes only — no
interfaces, no ABCs, no `BaseRepository[T]`, no Unit-of-Work. It exists to keep
`expense_service.py` from becoming a 600-line file mixing queries with business
rules. The rule that makes it safe: **repositories never commit; services own the
transaction.**

**`expense_splits` is how partial-group expenses work.** One row per participant.
The `Expense_Items` / `Item_Splits` tables from the original design solve a
different, narrower problem (per-item receipt splitting) and land in Step 3 —
they will write into `expense_splits`, so balances never learn items exist.

**Added `settlements` to Step 1.** The original plan deferred it to Step 2 with
min-cash-flow, but recording a repayment is plain CRUD, and without it balances
could only ever grow. Min-cash-flow will now merely *suggest* rows for this table.

**Enums are VARCHAR + CHECK, never native Postgres ENUM.** `ALTER TYPE ... ADD VALUE`
is a migration headache and these enums will grow.

**No `expenses.currency`** (currency lives on the group; per-expense currency implies
FX nobody will build) and **no soft delete** (a forgotten `deleted_at` filter in the
balances query would silently corrupt everyone's numbers).

**`group_members.left_at`** instead of deleting the row, so history survives.

## Things that bit us

- **`create_constraint` defaults to `False`** on SQLAlchemy's `Enum`. We had
  `native_enum=False` and assumed we were getting VARCHAR + CHECK; we were getting a
  bare VARCHAR with nothing stopping a bad value. Caught by querying `pg_constraint`
  rather than trusting the model. Now explicitly `create_constraint=True`.
- **Port 5432 was taken** by a native `postgresql-x64-16` Windows service, and 5433
  by a WSL relay, so the container runs on **5434**. The symptom was a confusing
  `password authentication failed for user "studentwise"` against a container that
  had just been created correctly.
- **Replacing an expense's splits** tripped the `(expense_id, user_id)` unique index:
  SQLAlchemy inserted the new rows before deleting the orphans. Fixed by clearing
  and flushing first.
- **PATCHing an expense** defaulted to "everyone in the group" when participants
  weren't supplied, which would have silently widened an expense shared by two of
  four flatmates. Now it keeps the existing participants unless new ones are named.
- **`ruff` treated `alembic` as a local package** because of the `alembic/` directory;
  pinned it as third-party in `pyproject.toml`.

## Step 2 (algorithms) — also done this session

- `GET /groups/{id}/balances` — `net = paid - owed + settlements_sent - settlements_received`.
  Positive means the group owes you. Nets always sum to exactly zero.
- `app/domain/settlement_algo.py` — min-cash-flow, written test-first like
  `splitting.py`. 42 tests including 30 randomised property tests.
- `GET /groups/{id}/settlement-plan` — suggestions only, writes nothing.

Nothing in the schema had to change: balances are a read-only aggregate over
`expenses`, `expense_splits` and `settlements`.

**Deviation from the plan:** the plan said `POST /groups/{id}/settle`. It became
`GET /groups/{id}/settlement-plan`, because an endpoint that suggests transfers
without changing anything should not be a POST. Recording a real repayment is
still `POST /groups/{id}/settlements`.

**On "minimum":** finding the genuinely fewest transfers is NP-hard (subset-sum).
We pair off exactly-matching debts, then match largest debtor against largest
creditor. That guarantees at most n-1 transfers — good, not provably optimal.
Worth saying plainly in the report rather than claiming optimality.

Sanity check against the seeded flat: Maya +206.74, Gal −99.46, Noa −107.28,
summing to 0.00, settled by 2 transfers for 3 people.

## Next: Step 3

1. Bit / PayBox deep links off `users.phone_number`, driven by the settlement plan.
2. AI ingestion: `expense_items` + `item_splits`, receipt OCR, voice entry.
3. Analytics and anomaly detection.

The frontend is now unblocked on everything a Splitwise clone needs: groups,
expenses, splits, repayments and balances.
