# Onboarding — clone to running app

For Hila and Dana. Target: a working API on your laptop in about ten minutes,
most of which is downloads.

`README.md` is the reference for commands and troubleshooting. This page is the
path through it the first time, plus what to do once it runs.

---

## 0. Before you start (install these once)

| Tool | Why | Check it works |
|---|---|---|
| [Git](https://git-scm.com/download/win) | clone the repo | `git --version` |
| [Python **3.12**](https://www.python.org/downloads/release/python-3129/) | not 3.13, not 3.14 — see below | `py -3.12 --version` |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | runs Postgres | `docker --version` |

**Docker Desktop must actually be running** (whale icon in the tray), not just
installed. Nothing below works otherwise.

**Why 3.12 exactly:** `psycopg-binary` publishes prebuilt wheels for CPython
3.10–3.13 only. On 3.14 pip tries to compile it from C source, which needs MSVC
Build Tools and libpq headers on every laptop. Not worth it.

You also need a GitHub account, and Gal needs to have added you to the repo.

---

## 1. Clone and start the database

```powershell
git clone https://github.com/galharel23/StudentWise.git
cd StudentWise
docker compose up -d
```

Postgres comes up on host port **5434** (not 5432 — see README → Ports).

Check it: `docker compose ps` should show `studentwise-db` as running.

---

## 2. Set up the backend

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
alembic upgrade head
```

`(.venv)` should now be at the start of your prompt. If PowerShell refuses to run
the activate script:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

`alembic upgrade head` creates all eight tables. Run it again any time you pull
changes that touch the schema.

---

## 3. Put data in it, then run it

```powershell
python seed.py
uvicorn app.main:app --reload
```

`seed.py` creates the flat **Dizengoff 5** with three users
(`gal@`, `maya@`, `noa@studentwise.dev`, password `password123`), eighteen
expenses across every split type, a settlement, and a comment thread. It wipes
and re-seeds, so run it as often as you like.

Open **http://localhost:8000/docs**.

---

## 4. Prove it works (2 minutes)

In `/docs`:

1. Click **Authorize** (top right). Username `gal@studentwise.dev`, password
   `password123`. Leave the other fields alone. → Authorize → Close.
2. `GET /api/groups` → **Try it out** → **Execute**. You should get one group.
   Copy its `id`.
3. `GET /api/groups/{group_id}/balances` with that id. The `net` values must sum
   to exactly zero.
4. `GET /api/groups/{group_id}/settlement-plan`. This is the minimum set of
   transfers that would square everyone up.
5. `GET /api/activity`. Newest first, expenses and settlements mixed.

If all five work, your environment is correct.

Then run the tests once, so you know green looks like green:

```powershell
pytest
```

Roughly 90 seconds. Every one should pass. If they do not, that is a bug in the
setup, not in your code — say so before changing anything.

---

## 5. Where things are

```
backend/app/
  api/           HTTP only: parse, call a service, return a schema. No SQL.
  services/      business rules. Services commit; nothing else does.
  repositories/  queries. Never commit.
  models/        the database tables.
  domain/        pure maths: numbers in, numbers out. No database, no FastAPI.
  schemas/       what requests and responses look like (Pydantic).
frontend/        the React PWA -- see frontend/README.md
docs/
  roadmap.md     every epic and mission, and what is done
  api-contract.md  the endpoint contract — read this before building UI
  sessions/      what was built each session and why
```

Read `CLAUDE.md` at the root. It is short and it is the rulebook — for us and
for Claude. The rules that bite hardest:

- **Money is always `Decimal` / `NUMERIC(12,2)`, never `float`.** In JSON it is a
  string. In JavaScript, parse it with a decimal library.
- **Repositories never call `db.commit()`.** Break this and you get half-written
  expenses with no splits.
- **Every schema change gets an Alembic migration in the same commit** as the
  model change.
- **Every new endpoint gets a test** in `backend/tests/api/`.

---

## 6. Your first mission

Pick it up from `docs/roadmap.md` — it lists every mission with an owner.

**Dana — frontend (Epic 9).** 9.1–9.7 and 9.11 are built: the app runs end to
end. Read `frontend/README.md` first, then pick up **9.8** (charts), **9.9** (the
natural-language Ask screen) or **9.10** (anomaly alerts). All three are new
screens against endpoints that already exist.

```powershell
cd frontend
npm install
npm run gen:api        # regenerate the API types (the backend must be running)
npm run dev            # http://localhost:5173
```

Sign in as `gal@studentwise.dev` / `password123`. `/__kitchen-sink` shows every
shared component in every variant — build from those rather than new markup.

Four things that will bite if you miss them:

- **Money is a string.** `"33.34"`, not `33.34`. Use `lib/money.ts`, and note
  that it deliberately has no function that divides a total between people: the
  server allocates the cents and the client must never guess.
- **Only `src/styles/` may name a colour or a font.** A test fails otherwise.
- **`ms-`/`me-`, never `ml-`/`mr-`.** Another test. The app goes Hebrew later.
- **Never edit `src/api/schema.d.ts`** — it is generated from the backend.

**Hila — AI and ingestion (Epic 5).** Start with 5.1 and 5.2 (the
`expense_items` / `item_splits` tables and the per-item split API). They are
pure backend with no AI in them, and everything else in that epic writes through
them. Then 5.3/5.4, receipt OCR — the headline demo moment. Receipt *upload* and
storage already exist (mission 2.11), so 5.4 starts from an image that is already
on the server.

**The one constraint in Epic 5 that is not negotiable:** items and their splits
must compute and write ordinary `expense_splits` rows. Balances, settlement and
analytics must never learn that items exist. Break that and every algorithm in
Epics 3 and 4 needs reworking.

Your files are `backend/app/ai/` and `backend/app/api/ai.py`. Call
`expense_service` functions; do not touch `models/` or `repositories/`. That is
what keeps us out of each other's merge conflicts.

---

## 7. How we work

```powershell
git checkout main
git pull
git checkout -b feat/what-you-are-doing
# ... work ...
ruff check --fix . ; ruff format .    # from backend/
pytest
git add -A
git commit -m "Add per-item splitting"
git push -u origin feat/what-you-are-doing
```

Then open a pull request on GitHub, and one other person approves it. Squash-merge.

Never push to `main` directly. CI runs `ruff check`, `alembic check` and `pytest`
on every push and every PR; a red PR does not get merged.

At the end of a working session write a short summary to
`docs/sessions/YYYY-MM-DD-topic.md`: what you built, what you decided and why,
what is next, and anything that surprised you. Those files are most of the
written report later, and they are much easier to write now than in December.

---

## 8. When something is broken

- **`password authentication failed for user "studentwise"`** — you are reaching
  a different Postgres than the container. README → Troubleshooting has the
  command to find out what owns the port.
- **`port is already allocated`** — change the host side of the mapping in
  `docker-compose.yml` and the port in your `.env`. Nothing else needs to change.
- **Tests fail on a fresh clone** — say so before changing anything. That is an
  environment problem or a bug on `main`, and neither is yours to work around.
- **`alembic check` fails** — a model was changed without a migration. Run
  `alembic revision --autogenerate -m "what changed"`, read what it generated,
  and commit it with the model change.
- **Reset everything** — `docker compose down -v`, `docker compose up -d`,
  `alembic upgrade head`, `python seed.py`.
