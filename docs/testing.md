# Testing — the demo accounts, and the test suites

Two different things live in this file, because people reach for them at the
same moment:

1. **Testing by hand** with the accounts `seed.py` creates — signing in as
   somebody, clicking around, calling endpoints in `/docs`.
2. **Running the automated suites** — 672 backend tests, 253 frontend ones, and
   what they will refuse to let you do.

If you have not got the project running yet, start at
[`onboarding.md`](onboarding.md) instead and come back here.

---

## Part 1 — testing by hand

### The one command

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python seed.py
```

It **wipes StudentWise's own tables and rebuilds them**, so run it as often as
you like — after a migration, after you have made a mess, before a demo. It
writes through the service layer rather than straight into the database, so
everything it creates obeys the same invariants the API enforces: splits sum
exactly to their total, participants are really members.

You need a database running (`docker compose up -d`) and migrations applied
(`alembic upgrade head`). `seed.py` does not apply migrations for you.

### The accounts

Seven users. **Every one of them has the password `password123`.**

| Email | Name | Use it to see |
|---|---|---|
| `gal@studentwise.dev` | Gal | **The main account.** In five groups, owns three, owed money in some and owing in others |
| `maya@studentwise.dev` | Maya | The *owner* of a group Gal is only a member of, and of a group Gal cannot see at all |
| `noa@studentwise.dev` | Noa | A plain member of the flat; owns the fully-settled trip |
| `yotam@studentwise.dev` | Yotam | The other half of the couple group |
| `hila@studentwise.dev` | Hila | A trip member and nothing else — what a nearly-empty account looks like |
| `dana@studentwise.dev` | Dana | Same, plus the group Gal is not in |
| `omri@studentwise.dev` | Omri | Only in the settled trip — every balance zero |

**Sign in as Gal for almost everything.** The other accounts exist for the cases
that are invisible from one account: what a non-owner is not allowed to do, what
an empty account looks like, and whether `GET /api/groups` filters by membership
or just returns the table.

### The groups, and what each one is for

None of these is filler. Each exists to make one branch of the code visible.

| Group | Type | Currency | Who | What it proves |
|---|---|---|---|---|
| **Dizengoff 5** | shared apartment | ILS | Gal (owner), Maya, Noa | The main flat. All four split types, a rent-by-room-size rule, budgets, comments, two recurring bills |
| **Berlin, August** | trip | **EUR** | Maya (owner), Gal, Yotam, Hila | A second currency, and Gal as a *member* — no rename, no remove-member, no delete |
| **Gal & Yotam** | couple | ILS | Gal (owner), Yotam | Two people, the smallest group that still has balances |
| **Eilat, that weekend** | trip | ILS | Noa (owner), Gal, Dana, Omri | **Fully settled — every balance is exactly zero.** The settle-up screen with nothing to do |
| **Just me** | solo | ILS | Gal alone | No balances, nothing to settle. Six months of history, so the charts have a shape |
| **Florentin 22** | shared apartment | ILS | Maya (owner), Noa, Dana | **Gal is not in it.** If it ever shows up in Gal's list, the endpoint is returning the table |

Totals: 49 expenses, 6 settlements, 4 comments, 1 split rule, 3 budgets,
2 recurring bills, and the notifications all of that raised.

Two deliberate details that catch bugs:

- **Gal is owed money in Berlin and in the couple, and owes money in the flat.**
  Any screen that adds Gal's position into one number is either keeping the
  currencies apart or visibly wrong.
- **The history is backdated.** `created_at` defaults to `clock_timestamp()`,
  which is right for the app and useless for a seed — one run would stamp every
  row with the same second and collapse the activity feed into a single "Today".
  `seed.py` pushes each row back onto its own event date afterwards.

### Signing in

**In `/docs`** (easiest): open <http://localhost:8000/docs>, click **Authorize**
at the top right, enter `gal@studentwise.dev` / `password123`, leave every other
field alone, Authorize, Close. Every "Try it out" below now carries the token.

**From the frontend**: <http://localhost:5173>, the same email and password.

**From a terminal**, when you want the raw token. Login is a *form* post, not
JSON, and the field is called `username` even though it holds an email — that is
the OAuth2 password-flow shape FastAPI's Authorize button expects:

```powershell
$r = Invoke-RestMethod -Method Post http://localhost:8000/api/auth/login `
  -Body @{ username = 'gal@studentwise.dev'; password = 'password123' }
$token = $r.access_token

Invoke-RestMethod http://localhost:8000/api/groups `
  -Headers @{ Authorization = "Bearer $token" }
```

```bash
# bash equivalent
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -d 'username=gal@studentwise.dev&password=password123' | jq -r .access_token)
curl -s http://localhost:8000/api/groups -H "Authorization: Bearer $TOKEN"
```

Tokens last a week (`JWT_EXPIRE_MINUTES=10080`), so one lasts a working session.

### Five checks that prove your environment, in about two minutes

Authorized as Gal in `/docs`:

1. `GET /api/groups` → **five** groups. Not six: **Florentin 22 must not be
   there.** Copy the id of *Dizengoff 5*.
2. `GET /api/groups/{id}/balances` for the flat → the `net` values sum to
   **exactly zero**. They always do, in every group, for every seed. If they do
   not, stop and say so.
3. `GET /api/groups/{id}/settlement-plan` → the minimum set of transfers that
   squares everyone up.
4. `GET /api/activity` → newest first, expenses and settlements mixed, across
   every group you are in.
5. `GET /api/groups/{id}/analytics/summary` → totals by category and by member.

All five working means the database, the migrations, the auth and the seed are
all correct.

### Then go looking for the interesting ones

| Try this | Where | What you should see |
|---|---|---|
| `POST /api/groups/{flat}/recurring-bills/run` | flat | Posts bills that have fallen due. **Run it twice** — the second run does nothing. That is the whole design |
| `GET /api/groups/{flat}/budgets` | flat | One budget comfortably under, one about to be blown |
| `GET /api/groups/{flat}/analytics/duplicates` | flat | The "did we pay this twice?" detector |
| `GET /api/groups/{flat}/analytics/anomalies` | flat | Median + MAD, no AI involved |
| `GET /api/groups/{eilat}/settlement-plan` | Eilat | **Empty.** Everyone is square |
| `GET /api/groups/{berlin}` | Berlin | `currency: "EUR"`, and Gal is `MEMBER`, not `OWNER` |
| `PATCH /api/groups/{berlin}` as Gal | Berlin | **403.** Gal does not own it |
| `GET /api/groups/{florentin}` as Gal | Florentin | **403.** The whole authorization model is two lines in `core/deps.py`: 404 if the group does not exist, 403 if you are not an active member of it |
| `POST .../analytics/ask` | any | Natural-language question → SQL. **503 without an `ANTHROPIC_API_KEY`**, which is expected and fine |

### Testing a change you just made

The honest loop, in order:

1. `python seed.py` — back to a known state.
2. Exercise it in `/docs` or in the app.
3. **Check the balances still sum to zero** if you touched anything near money.
4. `pytest` before you push. Not after.

### Resetting

| Situation | Command |
|---|---|
| Data is a mess | `python seed.py` |
| Schema is wrong, data is disposable | `docker compose down -v` then `up -d`, `alembic upgrade head`, `python seed.py` |
| Just pulled changes that touch models | `alembic upgrade head` then `python seed.py` |

`python seed.py` also clears Gmail connections and bills imported from Gmail,
so anyone who connected Gmail connects again afterwards. The demo world itself
has no Gmail data: connecting needs a real Google client, which
[`gmail-setup.md`](gmail-setup.md) walks through. Every Gmail test in `pytest`
stubs Google and Claude, so the suites need neither.

It also deletes every conversation with the money assistant (the Chat screen).
The demo world starts with none: each one is a real exchange with Claude, so
there is nothing worth seeding.

**`seed.py` only wipes a database on your own machine without asking.** If
`DATABASE_URL` points anywhere else -- the live Neon database, say -- it stops
and tells you to name the host: `python seed.py --wipe=<host>`. The same demo
world, with the same seven accounts and `password123`, is what the deployed app
is seeded with, so a grader signing in there sees exactly what this page
describes. Receipt photos uploaded on the live app are stored in Postgres
(`receipt_images`) rather than on disk, and the seed clears those too.

`docker compose down -v` drops the volume. Everything in the database goes,
including the test database — which is fine, the init script recreates it on the
next boot.

---

## Part 2 — the automated suites

### Backend: `pytest`

```powershell
cd backend
.\.venv\Scripts\Activate.ps1

pytest                    # everything: 1,038 tests, about two minutes
pytest tests/unit -q      # 428 of them, pure logic, no database, under a second
pytest tests/api/test_expenses.py            # one file
pytest -k "settlement and not plan"          # by name
pytest -x --lf                               # stop at the first failure, then rerun just it
```

**Tests use their own database**, `studentwise_test`, not the one you seeded.
Nothing you do by hand can affect a test run, and no test run can destroy your
demo data. The database is created once by
[`docker/init-test-db.sql`](../docker/init-test-db.sql) when the container first
boots; if you ever delete the volume it comes back on the next `up`.

Two things about the harness that will surprise you:

- **The test schema is built by running the migrations**, not by
  `Base.metadata.create_all`. The faster way lies: `create_all` rebuilds a
  VARCHAR enum's CHECK constraint from the model, while a real database only
  gets it widened by a migration somebody remembered to write — and
  `alembic check` does not notice the difference. Building the test schema the
  way production is built turns a forgotten migration into a failing test
  instead of a 500 after deploying. This really happened; two enums had drifted.
- **Every test runs inside a transaction that is rolled back**, even though
  services call `db.commit()`. `join_transaction_mode="create_savepoint"` turns
  the service's commit into a savepoint release. So tests are isolated *and*
  they exercise the real commit path.

### Writing a backend test

**Every new endpoint gets a test in `tests/api/`.** Not a suggestion — it is
rule 7 in `CLAUDE.md` and CI will not tell you off, but a reviewer will.

Read a neighbouring file in [`backend/tests/api/`](../backend/tests/api/) before
writing a new one; the fixtures in
[`conftest.py`](../backend/tests/conftest.py) already give you a client, a
database session and signed-in users. Two habits worth copying:

- **Money in tests is `Decimal` too.** `Decimal("33.34")`, never `33.34`. A
  float in a test is a float in the assertion, and it will eventually be wrong
  by a cent at the worst possible moment.
- **Assert on the balance, not only on the response.** The interesting bugs are
  the ones where the endpoint returns 201 and the splits are wrong.

### Frontend: `npm test`

```powershell
cd frontend
npm test                  # once
npm run test:watch        # while working
npm run typecheck         # tsc; the i18n keys are checked here
npm run lint
```

**Three of those tests are guards** — they enforce rules no reviewer reliably
catches, and they are the reason the rules hold:

| Guard | Fails on |
|---|---|
| `test/guards/design-tokens.test.ts` | A hex, an `rgb(`, a `font-family` or a Tailwind arbitrary-colour class outside `src/styles/` |
| `test/guards/logical-props.test.ts` | `ml-`/`mr-`/`text-left` — physical direction utilities, which survive a `dir` flip and mirror the layout wrongly in Hebrew |
| `test/guards/no-bare-strings.test.ts` | A user-visible string that is not a key in `src/i18n/messages/`. It found seventeen the translation pass itself missed |

If one of these fails, it is not being pedantic. Fix the code, not the guard.

**Tests run on `happy-dom`, not jsdom**, and that is load-bearing: jsdom
installs its own `AbortController`, and once MSW patches the global `Request`
the brand check in `new Request(url, {signal})` fails. TanStack Query passes a
signal to every query, so under jsdom *every* request threw before it was sent.

### Measuring the AI: `python eval_text_to_sql.py`

The tests above replace Claude with a stub, so they prove the plumbing and say
nothing about whether the model's answers are *right*. That is measured
separately, by hand, because every run calls the real model and costs money
(roughly a dollar for `--repeat 3`, estimated from token counts):

```powershell
cd backend
python eval_text_to_sql.py --repeat 3 --report ..\docs\evals\my-run.md
python eval_text_to_sql.py --only balances,eilat-divers   # a few questions
python eval_text_to_sql.py --model claude-opus-5          # another model
```

It asks the Ask screen's questions -- in English and Hebrew, easy to hard,
plus a few hostile ones -- through the real endpoint path, and compares each
answer with a hand-written query's (`backend/evals/text_to_sql_cases.py`). The
demo world is built in `studentwise_test`, so **your seeded data is never
touched**. Results so far are in [`docs/evals/`](evals/).

**Adding a question:** add a `Case` with its gold SQL and, if you can work it
out from `seed.py`, the `expect`ed answer. `pytest tests/api/test_text_to_sql_eval.py`
then checks your answer key before the model is ever graded against it.

### What CI runs on your pull request

Three jobs, all of which you can run locally first:

| Job | Runs | Locally |
|---|---|---|
| `backend` | `ruff check`, `ruff format --check`, `alembic upgrade head`, `alembic check`, `pytest` | `ruff check --fix . ; ruff format . ; pytest` |
| `frontend` | `npm run lint`, `format:check`, `typecheck`, `test`, `build` | `npm run lint ; npm test ; npm run build` |
| `contract` | Regenerates `src/api/schema.d.ts` from `app.main` and fails on a diff | `npm run gen:api` with the backend running, then `git diff` |

`alembic check` failing means a model was changed without a migration. Run
`alembic revision --autogenerate -m "what changed"`, **read what it generated**,
and commit it alongside the model change.

The `contract` job failing means the backend changed a response model and the
frontend's generated types are stale. Run `npm run gen:api` and commit the
result. It is the frontend's `alembic check`.

---

## When a test fails on a fresh clone

**Say so before changing anything.** That is an environment problem or a bug on
`main`, and neither is yours to work around. The usual causes, in order of how
often they are the answer:

1. **The database is not running** — `docker compose ps` should show
   `studentwise-db` as healthy.
2. **You are reaching a different Postgres.** A native Windows Postgres service
   on the same port will accept the connection and then reject the password. See
   README → Troubleshooting for the command that names the process on the port.
3. **Migrations are behind** — `alembic upgrade head`.
4. **`.env` is missing** — `copy .env.example .env` in `backend/`.
