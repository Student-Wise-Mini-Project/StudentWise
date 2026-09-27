# StudentWise — Working Rules

Expense-splitting app (Splitwise/Tricount style) with AI features layered on top.
Team of 3. Backend first, step by step: **Step 1 = DB + Auth + CRUD**, Step 2 =
algorithms (balances, min-cash-flow), Step 3+ = AI.

## Start here

This file is the rulebook — *what must be true of the code*. It is not a
tutorial. If you are new, read them in this order:

| Read | For |
|---|---|
| [`docs/onboarding.md`](docs/onboarding.md) | Clone → running app → your first mission. Day one, in order |
| [`docs/testing.md`](docs/testing.md) | The seven demo accounts, what each seeded group proves, both test suites, what CI runs |
| **This file** | The rules that make a change acceptable |
| [`docs/roadmap.md`](docs/roadmap.md) | Every epic and mission, with owners and status |
| [`docs/api-contract.md`](docs/api-contract.md) | The endpoint contract, before building any UI |
| [`frontend/README.md`](frontend/README.md) | The four frontend rules, and why each is a test |
| [`docs/gmail-setup.md`](docs/gmail-setup.md) | The one-time Google Cloud setup for importing bills from Gmail |
| [`docs/sessions/`](docs/sessions/) | What each session built and why -- the latest say what is newest |

**The thirty-second version.** Postgres in Docker on port 5434; backend is
Python 3.12 + FastAPI in `backend/` with a venv you must activate every
terminal; `python seed.py` builds seven users and six groups, all with the
password `password123`; sign in as `gal@studentwise.dev`. Four layers, and
**only services commit**. Money is `Decimal`, never `float`. Every schema change
ships with its migration; every endpoint ships with its test.

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
| AI | `anthropic` SDK, `messages.parse` with a Pydantic schema. Default model `claude-sonnet-5` (per-feature setting) |
| Gmail | `google-auth`, `google-auth-oauthlib`, `google-api-python-client`; `cryptography` (Fernet) for stored tokens; `rapidfuzz` for addresses |
| Tests | pytest + FastAPI TestClient |
| Lint | ruff (lint + format). No mypy, no pre-commit hooks. |
| DB | Postgres 16 via `docker compose up -d` |
| Frontend | React 19 + Vite + TypeScript, **Tailwind v4** (CSS-first `@theme`) |
| FE state | TanStack Query v5. React Router v8. No Redux. |
| FE API | Types **generated** from `/openapi.json`; never hand-written |
| FE tests | Vitest + Testing Library + MSW, `happy-dom` (not jsdom -- see below) |

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


## Frontend rules

Four of these are enforced by tests, not by review, because none of them fail
loudly on their own.

10. **Only `frontend/src/styles/` may name a colour or a typeface.** A hex, an
    `rgb(`, a `font-family` or a Tailwind arbitrary-colour class anywhere else
    fails `test/guards/design-tokens.test.ts`. This is what keeps a redesign to
    one file plus the shared components. The brief it is built from is
    `docs/design-brief.md`.
11. **No physical direction utilities.** `ms-`/`me-`, never `ml-`/`mr-`;
    `text-start`, never `text-left`. The app is English now and right-to-left
    Hebrew later, and physical utilities survive a `dir` flip and land the layout
    mirrored in the wrong places. `test/guards/logical-props.test.ts` catches
    them, because nobody here is reading Hebrew while building.
12. **The client never divides money.** `lib/money.ts` formats and validates and
    exposes nothing that splits a total between people -- the backend allocates
    cents by largest remainder and a second implementation would disagree by one.
    `divideForDisplay` returns `{value, approximate: true}`, so the only thing
    that can render it is `<Money approximate/>` and the `≈` is enforced by the
    type system.
13. **`src/api/schema.d.ts` is generated. Never edit it.** Run `npm run gen:api`
    after a backend change and commit the result. The `contract` CI job
    regenerates it from `app.main` and fails on a diff -- the frontend's
    `alembic check`.
14. **No user-visible string lives in a component.** Every one is a key in
    `frontend/src/i18n/messages/`, rendered with `t()`. Keys are derived from
    the English catalogue, so a typo and a missing Hebrew string are both `tsc`
    errors; `test/guards/no-bare-strings.test.ts` catches what the types cannot
    see -- it found seventeen the translation pass itself missed.
    **Hebrew is gender-neutral**: `החוב שלך`, not `אתה חייב`; `בתשלום גל`, not
    `גל שילם`. The API stores no gender and should not start. Past-tense second
    person (`שילמת`, `הוספת`) is spelled the same either way and is safe.

### Frontend notes

- **Tests run on `happy-dom`, not jsdom.** jsdom installs its own
  `AbortController`, and once MSW patches the global `Request`, the brand check
  in `new Request(url, {signal})` fails. TanStack Query passes a signal to every
  query, so under jsdom *every* typed-client request threw before it was sent.
- **The generated types are stricter than the API**: any field with a
  server-side default comes out required. Send it explicitly.
- **Receipts cannot use `<img src>`** -- the endpoint needs the `Authorization`
  header, so the bytes are fetched and turned into an object URL.
- **Nothing runs on a scheduler**, so opening a group posts the bills that are
  due (`features/recurring`), once per group per session.

## Commands

From `backend/`, with `.\.venv\Scripts\Activate.ps1` run first — every new
terminal needs it.

```powershell
docker compose up -d                  # start Postgres (host port 5434)
alembic upgrade head                  # apply migrations (run from backend/)
python seed.py                        # rebuild the demo data (wipes first)
uvicorn app.main:app --reload         # run the API
pytest                                # run tests (separate DB: studentwise_test)
pytest tests/unit -q                  # fast: pure logic only
ruff check --fix . ; ruff format .    # lint + format
alembic revision --autogenerate -m "add expenses"   # new migration
alembic check                         # does the schema match the models?
```

**First time on a new machine**, in order: `docker compose up -d` ·
`py -3.12 -m venv .venv` · activate · `pip install -r requirements.txt` ·
`copy .env.example .env` · `alembic upgrade head` · `python seed.py`.
Full version, with what goes wrong: [`docs/onboarding.md`](docs/onboarding.md).

```powershell
cd frontend
npm run dev                           # http://localhost:5173, /api proxied to :8000
npm run gen:api                       # regenerate the API types (backend must be up)
npm test ; npm run lint ; npm run build
npm run gen:icons                     # PWA icons, from one SVG
```

## Git

- `main` is protected **by convention, not by GitHub** — rulesets need a paid
  plan on a private repo. See `.github/branch-protection.md`; the rule is
  written and ready to apply. Never push to `main` directly.
- Branch per milestone: `feat/expenses-crud`.
- PR → one teammate approves → merge.
- **Rebase-merge when every commit is a mission; squash when the branch is
  messy.** Squashing four missions into one commit throws away four commit
  messages, and those messages are most of what mission 11.1 (design decisions
  recorded as we go) will be written from.
- **Do not delete a base branch while a PR is stacked on it.** GitHub closes the
  stacked PR and it cannot be reopened once the base is gone -- rebase the
  stacked branch onto `main` and open a fresh PR. Rebase-merging also rewrites
  the SHA, so a stacked branch always needs
  `git rebase --onto origin/main <old base sha>` afterwards.
- CI runs `ruff check` + `pytest`.

## Ownership (so we don't collide)

- **Gal** — `models/`, `repositories/`, `services/`, `domain/`, migrations. The core.
- **Teammate 2** — `app/ai/` package + `api/ai.py` (OCR, voice, Text-to-SQL,
  anomalies). Calls `expense_service` functions; never touches models or repositories.
- **Teammate 3** — `frontend/`. Builds against `docs/api-contract.md` and `/docs`.
  The scaffold, design system, auth, groups, expenses, balances, charts, i18n
  and PWA exist; see `frontend/README.md`.

**Epic 5 in practice (2026-09-27):** #3 built receipt scanning (5.1-5.5) and
Gmail bills (5.8-5.10) in `app/ai/`, including model and migration changes
in Gal's layers that he should review. Voice (5.6-5.7) is still #2's.

Onboarding docs are nobody's exclusive property: if you hit something that cost
you an hour and is not written down, write it down in the file where you would
have looked for it.

## End of session

Write a summary to `docs/sessions/YYYY-MM-DD-<topic>.md`: what was built, what
decisions were made and why, what's next, anything that surprised us.

**If the session changed `seed.py`, update `docs/testing.md` in the same
commit.** That page describes the demo world account by account and group by
group, and it is what a teammate trusts when they cannot tell a bug from a
misunderstanding. It went stale once already — promising three users when the
seed had seven — which is the same failure mode as a stale roadmap page, minus
the script that catches it.

Then tick the missions off in `docs/roadmap.md`, mirror them in
`docs/roadmap.html`, and run `node scripts/check-roadmap-sync.mjs` — it fails if
the two disagree. `roadmap.html` is the page people outside the repo actually
look at, and a status page that is quietly three weeks stale is worse than no
status page.

## Domain notes

- `expense_splits` is how "only some of the group is on this expense" works — a row
  exists only for a participant.
- **Anything that creates an expense goes through `expense_service`.** Recurring
  bills call `build_expense` (everything bar the commit) so several months land
  in one transaction. Nothing reimplements splitting, notifications or the
  budget check.
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
### AI ingestion (Epic 5)

- **Model calls live in `app/ai/`** (`receipt_ocr`, `bill_parser`, `gmail`),
  each behind one function the tests replace -- no test needs a key or a
  network. Amounts come back from the model as **strings** and are parsed to
  `Decimal`; never a float. Text in an image, PDF or email is data, never
  instructions, and every prompt says so.
- **Nothing a model read touches money until it is decided.** A receipt scan is
  a stateless draft a person checks. A bill from Gmail waits in
  `ingested_bills` until its flat is certain or a person approves it, and only
  then becomes an expense through `expense_service`. **Never add a status
  column to `expenses`** -- seventeen modules read it as money.
- **Items explain a split; they are not the split.** `expense_items` produce an
  ordinary `EXACT` split. A PATCH that changes the split drops the items.
- **A Gmail bill is split without a person only when** the sender is a known
  utility (`BILL_TRUSTED_SENDER_DOMAINS`), the amount was read, the mailbox
  owner has exactly one matching open `SHARED_APARTMENT` (by address when there
  are several -- house numbers must match exactly), there is no fixed-amount
  recurring bill of that kind, and the currency matches. Anything else goes to
  review. Anyone can email a convincing "לתשלום".
- **Gmail refresh tokens are Fernet-encrypted** (`TOKEN_ENCRYPTION_KEY`), and
  the OAuth `state` JWT carries its own audience so it can never sign anyone in.
- **Nothing reads email on a schedule.** Opening the app syncs once per session;
  `fetch_new_bills.py` exists for a real cron.

### Files

- **Uploaded bytes decide what a file is, not its `Content-Type`.** Receipt
  storage keys are generated from the expense UUID and re-checked against a
  pattern before they become a path — nothing a user typed reaches the
  filesystem. See `core/storage.py`.
