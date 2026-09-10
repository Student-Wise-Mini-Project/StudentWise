# StudentWise

Expense splitting for shared apartments, couples and trips — with AI on top.
University project, 3 people. See `CLAUDE.md` for the rules of the road.

## Setup (Windows, PowerShell)

```powershell
# 1. Start Postgres (Docker Desktop must be running)
docker compose up -d

# 2. Backend
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env

# 3. Run it
uvicorn app.main:app --reload
```

API docs: http://localhost:8000/docs
Health check: http://localhost:8000/health

## Everyday commands

| What | Command |
|---|---|
| Start DB | `docker compose up -d` |
| Apply migrations | `alembic upgrade head` (from `backend/`) |
| Run server | `uvicorn app.main:app --reload` |
| Run tests | `pytest` |
| Lint + format | `ruff check --fix . && ruff format .` |

## Layout

- `backend/` — FastAPI + Postgres API
- `frontend/` — React + Tailwind PWA (not started)
- `docs/roadmap.md` — every epic and mission, with what's done
- `docs/api-contract.md` — the endpoint contract the frontend builds against
- `docs/sessions/` — end-of-session summaries

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
