# StudentWise

Expense splitting for shared apartments, couples and trips — with AI on top.
University project, 3 people. See `CLAUDE.md` for the rules of the road.

**New to the project?** Start with **[`docs/onboarding.md`](docs/onboarding.md)** —
clone to a running app in about ten minutes, then your first mission. Then
**[`docs/testing.md`](docs/testing.md)** for the demo accounts and the test
suites.

## Setup (Windows, PowerShell)

Needs **Python 3.12** (not 3.13 or 3.14 — `psycopg-binary` has no wheel),
**Docker Desktop running**, and **Node 20+** only if you are touching the
frontend.

```powershell
# 1. Start Postgres (Docker Desktop must be running)
docker compose up -d

# 2. Backend
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
alembic upgrade head

# 3. Demo data, then run it
python seed.py
uvicorn app.main:app --reload
```

API docs: http://localhost:8000/docs
Health check: http://localhost:8000/health

Sign in as **`gal@studentwise.dev`** / **`password123`** — in `/docs` use the
**Authorize** button. Every seeded user has that password.

```powershell
# 4. Frontend (optional; the backend must be running for both commands)
cd ..\frontend
npm install
npm run gen:api
npm run dev            # http://localhost:5173
```

## Everyday commands

| What | Command |
|---|---|
| Start DB | `docker compose up -d` |
| Apply migrations | `alembic upgrade head` (from `backend/`) |
| Run server | `uvicorn app.main:app --reload` |
| Run tests | `pytest` |
| Lint + format | `ruff check --fix . ; ruff format .` |
| Reseed demo data | `python seed.py` (from `backend/`) |
| Post due recurring bills | `python run_due_bills.py` (from `backend/`) |
| Frontend dev server | `npm run dev` (from `frontend/`) |
| Frontend tests | `npm test` (from `frontend/`) |
| Regenerate API types | `npm run gen:api` (from `frontend/`, backend up) |
| Check the roadmap is in sync | `node scripts/check-roadmap-sync.mjs` |

## Testing

Two suites and a pile of demo data, all of it covered in
**[`docs/testing.md`](docs/testing.md)**: which of the seven seeded accounts to
sign in as, what each of the six groups is there to demonstrate, and what the
frontend's guard tests will refuse to let you do.

```powershell
pytest                    # backend: 672 tests, ~4 min. Venv active, from backend/
pytest tests/unit -q      # 298 of them are pure logic and run in under a second
npm test                  # frontend. From frontend/
```

Tests use a **separate database** (`studentwise_test`), created on the
container's first boot by `docker/init-test-db.sql`. Nothing you do by hand can
affect a test run, and no test run can destroy your demo data.

## Layout

- `backend/` — FastAPI + Postgres API
- `frontend/` — React + Tailwind PWA. Runs: see `frontend/README.md`
- `docs/onboarding.md` — first-run guide for a new teammate
- `docs/testing.md` — demo accounts, both test suites, what CI runs
- `docs/roadmap.md` — every epic and mission, with what's done
- `docs/api-contract.md` — the endpoint contract the frontend builds against
- `docs/design-brief.md` — the visual identity the frontend is built from
- `docs/sessions/` — end-of-session summaries
- `CLAUDE.md` — the rulebook: layering, money, migrations, ownership

## Ports

Postgres runs on host port **5434** (container-internal 5432). Two lower ports were
already taken on the original dev machine: 5432 by a native `postgresql-x64-16`
Windows service, 5433 by a WSL relay. If 5434 is busy on your laptop, change the host
side of the mapping in `docker-compose.yml` and the port in your `.env` — nothing else
needs to change.

## Troubleshooting

**`password authentication failed for user "studentwise"`** — you're reaching a
different Postgres than the container. Check what owns the port:

```powershell
Get-NetTCPConnection -LocalPort 5434 -State Listen | ForEach-Object { Get-Process -Id $_.OwningProcess }
```

**`port is already allocated`** on `docker compose up` — pick a free host port with the
same command over a range, then update `docker-compose.yml` and `.env`.

**Reset the database completely** — `docker compose down -v` (the `-v` drops the
volume), then `docker compose up -d` and `alembic upgrade head`.

## Recurring bills

Nothing in StudentWise runs on a scheduler — no Celery, no APScheduler. Bills
that fall due are posted by whoever asks:

- the app calls `POST /api/groups/{id}/recurring-bills/run` when it loads
- `python run_due_bills.py` does the same for every group, for a real cron

Both are safe to run as often as you like: a bill already posted for its due
date has moved on, and a reminder already sent is not sent again. If nothing
runs for a month, the next run posts the months it missed.

```
0 6 * * *  cd /srv/studentwise/backend && .venv/bin/python run_due_bills.py
```

## Uploaded files

Receipt images are written to `backend/var/receipts/` in development — local
disk behind a small interface, so moving to object storage later changes nothing
that reads a receipt. The directory is gitignored. Change it with
`RECEIPT_STORAGE_DIR` in `.env`.

## Natural-language querying

`POST /api/groups/{id}/analytics/ask` turns a plain-language question into SQL
via Claude. It needs an Anthropic API key in `backend/.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Without one the endpoint returns 503 and everything else works normally. Roughly
1-1.5 agorot per question (the schema prompt is cached).

### Optional hardening: a dedicated read-only role

Generated SQL is already validated, group-scoped, and run in a READ ONLY
transaction with a statement timeout. A dedicated Postgres role adds one more
layer, including making `users.password_hash` unreadable at the database level:

```sql
CREATE ROLE studentwise_readonly LOGIN PASSWORD 'readonly';
GRANT CONNECT ON DATABASE studentwise TO studentwise_readonly;
GRANT USAGE ON SCHEMA public TO studentwise_readonly;
GRANT SELECT ON groups, group_members, expenses, expense_splits, settlements
  TO studentwise_readonly;
-- Column list deliberately omits password_hash.
GRANT SELECT (id, name, email, phone_number, created_at) ON users
  TO studentwise_readonly;
```

Then point the app at it:

```
READONLY_DATABASE_URL=postgresql+psycopg://studentwise_readonly:readonly@localhost:5434/studentwise
```
