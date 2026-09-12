# Onboarding — clone to running app

For Hila and Dana. Target: a working API on your laptop in about ten minutes,
most of which is downloads, and the whole app — API plus interface — in about
twenty.

Three files, and it is worth knowing which is which:

- **This one** is the path through the first day, in order.
- **[`../README.md`](../README.md)** is the reference for commands, ports and
  troubleshooting. Come back to it when something breaks.
- **[`testing.md`](testing.md)** is the demo accounts and the test suites —
  which account to sign in as, what each seeded group is for, how to run pytest.

Read `../CLAUDE.md` at some point on day one. It is short and it is the rulebook,
for us and for Claude.

---

## 0. Before you start (install these once)

| Tool | Why | Check it works |
|---|---|---|
| [Git](https://git-scm.com/download/win) | clone the repo | `git --version` |
| [Python **3.12**](https://www.python.org/downloads/release/python-3129/) | the backend — not 3.13, not 3.14, see below | `py -3.12 --version` |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | runs Postgres | `docker --version` |
| [Node.js **20 or newer**](https://nodejs.org/) | only if you are touching the frontend | `node --version` |

**Docker Desktop must actually be running** (whale icon in the tray), not just
installed. Nothing below works otherwise.

**Why 3.12 exactly:** `psycopg-binary` publishes prebuilt wheels for CPython
3.10–3.13 only. On 3.14 pip tries to compile it from C source, which needs MSVC
Build Tools and libpq headers on every laptop. Not worth it. If `py -3.12`
reports anything other than 3.12, install it before going on — every confusing
failure later in this page traces back to the wrong Python.

You also need a GitHub account, and Gal needs to have added you to the repo.

---

## 1. Clone and start the database

```powershell
git clone https://github.com/galharel23/StudentWise.git
cd StudentWise
docker compose up -d
```

Postgres comes up on host port **5434**, not 5432 — two lower ports were taken
on the original dev machine, and README → Ports has the full story plus what to
change if 5434 is busy on yours.

Check it: `docker compose ps` should show `studentwise-db` as running and
healthy. That first boot also creates a **second database, `studentwise_test`**,
which is the one pytest uses; you never touch it by hand, but it is why running
tests can never destroy your demo data.

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

`(.venv)` should now be at the start of your prompt. **It has to be there every
time you run `pytest`, `alembic` or `uvicorn`** — a new terminal does not
remember it, and `.\.venv\Scripts\Activate.ps1` is the command that brings it
back.

If PowerShell refuses to run the activate script:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

`alembic upgrade head` creates all fourteen tables. Run it again any time you
pull changes that touch the schema — which is most of the time, so make it a
reflex after `git pull`.

`.env` needs no editing to get started. The one optional key is
`ANTHROPIC_API_KEY`, which only the natural-language Ask endpoint uses; without
it that one endpoint returns 503 and everything else is unaffected.

---

## 3. Put data in it, then run it

```powershell
python seed.py
uvicorn app.main:app --reload
```

`seed.py` builds a realistic demo world: **seven users, six groups, 49
expenses** across every split type, settlements, comments, budgets, a
rent-by-room-size rule and two recurring bills. It wipes and re-seeds, so run it
as often as you like.

The account to sign in as is **`gal@studentwise.dev`**, password
**`password123`** — every seeded user has that password.
[`testing.md`](testing.md) lists all seven and, more usefully, says what each
group exists to demonstrate. None of them is filler; there is a group in euros,
a group Gal does not own, a group that is fully settled, and one Gal is not in
at all so you can tell a working filter from a missing one.

Open **<http://localhost:8000/docs>**. Leave this terminal running.

---

## 4. Prove it works (2 minutes)

In `/docs`, click **Authorize** (top right), enter `gal@studentwise.dev` /
`password123`, leave the other fields alone, → Authorize → Close.

Then run the five checks in
[`testing.md` → Five checks that prove your environment](testing.md#five-checks-that-prove-your-environment-in-about-two-minutes).
The short version: five groups come back and not six, and the balances sum to
exactly zero.

Then run the tests once, in a **second terminal**, so you know what green looks
like:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest
```

672 tests, about four minutes on a laptop. Every one should pass. If they do
not, **that is a bug in the setup or on `main`, not in your code — say so before
changing anything.**

Four minutes is too slow for a working loop, and you do not need it: **298 of
those tests are pure logic** with no database behind them, and
`pytest tests/unit -q` runs the lot in under a second. Use that while you work
and the full suite before you push.

---

## 5. The frontend (skip if you are backend-only)

The backend has to be running for the first two commands: the API types are
generated from the live schema, and the dev server proxies `/api` to port 8000.

```powershell
cd frontend
npm install
npm run gen:api        # reads http://localhost:8000/openapi.json
npm run dev            # http://localhost:5173
```

Sign in with the same `gal@studentwise.dev` / `password123`.

`/__kitchen-sink` shows every shared component in every variant (dev server
only) — build from those rather than new markup. Read
[`../frontend/README.md`](../frontend/README.md) before writing any of it; it is
where the four enforced rules are explained, and each of them is a test you will
otherwise meet as a red build.

---

## 6. Where things are

```
backend/app/
  api/           HTTP only: parse, call a service, return a schema. No SQL.
  services/      business rules. Services commit; nothing else does.
  repositories/  queries. Never commit.
  models/        the database tables.
  domain/        pure maths: numbers in, numbers out. No database, no FastAPI.
  schemas/       what requests and responses look like (Pydantic).
  core/          errors, auth dependencies, storage.
backend/tests/
  unit/          pure logic, no database, runs in seconds
  api/           one file per endpoint group, against a real database
frontend/src/
  features/      one folder per area: groups, expenses, balances, ...
  components/    the shared component library (see /__kitchen-sink)
  api/           the generated client. schema.d.ts is generated — never edit it
  styles/        the only place a colour or a font may be named
  i18n/          every user-visible string, English and Hebrew
docs/
  onboarding.md  this file
  testing.md     demo accounts, the test suites, what CI runs
  roadmap.md     every epic and mission, and what is done
  api-contract.md  the endpoint contract — read this before building UI
  sessions/      what was built each session and why
```

The rules in `CLAUDE.md` that bite hardest:

- **Money is always `Decimal` / `NUMERIC(12,2)`, never `float`.** In JSON it is
  a string. In JavaScript, parse it with a decimal library.
- **Repositories never call `db.commit()`.** Services own the transaction. Break
  this and you get half-written expenses with no splits.
- **Every schema change gets an Alembic migration in the same commit** as the
  model change. CI runs `alembic check` and will catch you.
- **Every new endpoint gets a test** in `backend/tests/api/`.
- **Nothing imports upward.** `api/` → `services/` → `repositories/` → models,
  and `domain/` imports none of them.

---

## 7. Your first mission

Every mission lives in [`roadmap.md`](roadmap.md) with an owner, a size and a
status. Pick one that is ⬜ and yours, and say in the group chat which one you
have taken.

### Hila — AI and ingestion (Epic 5)

Start with **5.1 and 5.2**: the `expense_items` / `item_splits` tables and the
per-item split API. They are pure backend with no AI in them, everything else in
the epic writes through them, and they are a good way to meet the layering rules
on something self-contained. Then **5.3/5.4**, receipt OCR — the headline demo
moment. Receipt *upload* and storage already exist (mission 2.11), so 5.4 starts
from an image that is already on the server.

**The one constraint in Epic 5 that is not negotiable:** items and their splits
must compute and write ordinary `expense_splits` rows. Balances, settlement and
analytics must never learn that items exist. Break that and every algorithm in
Epics 3 and 4 needs reworking.

Your files are `backend/app/ai/` and `backend/app/api/ai.py`. Call
`expense_service` functions; do not touch `models/` or `repositories/`. That is
what keeps us out of each other's merge conflicts — and note that **anything
that creates an expense goes through `expense_service`**, which is what stops
splitting, notifications and the budget check from being reimplemented three
times.

### Dana — frontend (Epic 9)

**14 of 17 missions are done: the app runs end to end**, in English and Hebrew.
So your first job is to use it for ten minutes before writing anything — sign in
as Gal, add an expense, settle up, switch to Hebrew.

Then pick up **9.9** (the natural-language Ask screen), **9.10** (anomaly alerts
in the UI) or **9.12** (the Android APK wrapper). 9.9 and 9.10 are both new
screens against endpoints that already exist and are already tested.

Four things that will bite if you miss them:

- **Money is a string.** `"33.34"`, not `33.34`. Use `lib/money.ts`, and note
  that it deliberately has no function that divides a total between people: the
  server allocates the cents by largest remainder and the client must never
  guess.
- **Only `src/styles/` may name a colour or a font.** A test fails otherwise.
- **`ms-`/`me-`, never `ml-`/`mr-`.** Another test. The app runs in Hebrew.
- **Never edit `src/api/schema.d.ts`** — it is generated from the backend. Run
  `npm run gen:api` and commit the result.

All four are enforced by tests rather than by review, because none of them fails
loudly on its own. [`testing.md`](testing.md) explains what each guard catches.

---

## 8. How we work

```powershell
git checkout main
git pull
git checkout -b feat/what-you-are-doing
# ... work ...
ruff check --fix . ; ruff format .    # from backend/
pytest                                 # from backend/
npm run lint ; npm test                # from frontend/, if you touched it
git add -A
git commit -m "Add per-item splitting"
git push -u origin feat/what-you-are-doing
```

Then open a pull request on GitHub, and one other person approves it.

**Never push to `main` directly.** It is protected by convention rather than by
GitHub — rulesets need a paid plan on a private repo — which means the rule
holds only because we keep it.

**Rebase-merge when every commit is a mission; squash when the branch is
messy.** Squashing four missions into one commit throws away four commit
messages, and those messages are most of what the written report gets built
from. Do not delete a base branch while another PR is stacked on it: GitHub
closes the stacked PR and it cannot be reopened.

CI runs three jobs — `backend`, `frontend` and `contract` — on every push and
every PR. A red PR does not get merged. All three can be run locally first; see
[`testing.md` → What CI runs on your pull request](testing.md#what-ci-runs-on-your-pull-request).

At the end of a working session write a short summary to
`docs/sessions/YYYY-MM-DD-topic.md`: what you built, what you decided and why,
what is next, and anything that surprised you. Then tick your missions off in
`roadmap.md`, mirror them in `roadmap.html`, and run
`node scripts/check-roadmap-sync.mjs`. Those session files are most of the
written report later, and they are much easier to write now than in December.

---

## 9. When something is broken

- **`password authentication failed for user "studentwise"`** — you are reaching
  a different Postgres than the container, usually a native Windows install on
  the same port. README → Troubleshooting has the command that names the process
  holding the port.
- **`port is already allocated`** — change the host side of the mapping in
  `docker-compose.yml` and the port in your `.env`. Nothing else needs to change.
- **`ModuleNotFoundError`, or `alembic` is not a command** — the venv is not
  active in this terminal. `.\.venv\Scripts\Activate.ps1`.
- **Tests fail on a fresh clone** — say so before changing anything. That is an
  environment problem or a bug on `main`, and neither is yours to work around.
- **`alembic check` fails** — a model was changed without a migration. Run
  `alembic revision --autogenerate -m "what changed"`, **read what it
  generated**, and commit it with the model change.
- **The `contract` CI job fails** — the backend changed a response model and the
  frontend's generated types are stale. `npm run gen:api`, then commit.
- **Reset everything** — `docker compose down -v`, `docker compose up -d`,
  `alembic upgrade head`, `python seed.py`.

If none of that is it, ask in the group chat with the **exact error text**
rather than a description of it. Nine times out of ten somebody has seen it.
