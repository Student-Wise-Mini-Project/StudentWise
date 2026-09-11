# StudentWise — Full Roadmap

Everything the project needs, A to Z, split into **epics** (features) and
**missions** (a task one person can finish and merge).

**Status as of 2026-09-11:** 60 endpoints · 14 tables · 646 backend tests ·
148 frontend tests · 9 migrations · CI green.

**This file is the source of truth for status.** It is also published as a page —
`docs/roadmap.html`, live at
<https://claude.ai/code/artifact/30c5e8d0-ac69-43ed-8ef2-66a71fad9242>. Change a
status here, mirror it there, and run `node scripts/check-roadmap-sync.mjs`,
which fails if the two disagree. A status page nobody has updated in three weeks
is worse than none, because it is confidently wrong.

| Marker | Meaning |
|---|---|
| ✅ | Done and merged |
| 🔨 | In progress |
| ⬜ | Not started |
| 🚫 | Blocked — see the note |

**Size:** S = half a day · M = 1–2 days · L = 3–5 days · XL = a week or more

**Owners:** **Gal** = backend core · **#2** = AI/ingestion · **#3** = frontend.
Matches the file ownership already written into `CLAUDE.md`, so two people rarely
touch the same file.

---

## Scoreboard

| Epic | Done | Left | State |
|---|---:|---:|---|
| 0. Ways of working | 5 | 2 | 🔨 invites sent, not yet accepted |
| 1. Backend foundation | 5 | 0 | ✅ complete |
| 2. Core domain (Splitwise parity) | 13 | 0 | ✅ complete |
| 3. Algorithms | 4 | 0 | ✅ complete |
| 4. Analytics & intelligence | 5 | 1 | 🚫 only 4.4, blocked on a key |
| 5. AI ingestion (Module 1) | 1 | 8 | started |
| 6. Recurring & automation | 4 | 0 | ✅ complete |
| 7. Payments (Bit / PayBox) | 0 | 3 | ⬜ not started |
| 8. AI chat assistant / RAG | 0 | 4 | ⬜ not started |
| 9. Frontend | 9 | 3 | 🔨 the app works end to end |
| 10. Deployment | 0 | 6 | ⬜ not started |
| 11. Academic deliverables | 1 | 4 | started |
| **Total** | **38** | **40** | |

**The honest read:** the backend is essentially done. Epics 1, 2, 3 and 6 are
complete and Epic 4 has only its blocked mission left. Everything remaining is
either **somebody else's** (Epic 5 AI ingestion, Epic 9 frontend) or waiting on
a decision (Epic 10 hosting).

Epic 9 is now unambiguously the critical path: 12 missions, none started, and
nothing blocking them. There is a great deal of API and still no interface.

---

## Epic 0 — Ways of working

| # | Mission | Size | Owner | Status |
|---|---|---|---|---|
| 0.1 | Git repo, `main` branch, monorepo layout | S | Gal | ✅ |
| 0.2 | `CLAUDE.md` — stack, layering rule, code standards | S | Gal | ✅ |
| 0.3 | End-of-session summaries in `docs/sessions/` | S | Gal | ✅ |
| 0.4 | CI: ruff + `alembic check` + pytest on every push | S | Gal | ✅ |
| 0.5 | Add teammates as GitHub collaborators | S | Gal | 🔨 |
| 0.6 | Protect `main`: require PR + 1 review + green CI | S | Gal | 🚫 |
| 0.7 | Onboarding doc: clone → running app in 10 minutes | S | Gal | ✅ |

> **0.5 — invitations are sent, and none has been accepted yet.** Four are
> pending: three by email and one to `galq-harel`. An invitation grants nothing
> until the person clicks the link GitHub emailed them, so Hila and Dana still
> cannot see the code. Chase it before anything else; check with
> `gh api repos/galharel23/StudentWise/invitations`.
>
> *(The REST API only takes a username, which is why this had to be done in the
> web UI in the first place.)*
>
> **0.6 needs a paid plan.** Branch protection *and* rulesets are both refused on
> a private repo on the Free plan (`403 Upgrade to GitHub Pro`). The rule we want
> is written and ready to apply in `.github/ruleset-main.json`; the routes out are
> in `.github/branch-protection.md`. The best one is the GitHub Student Developer
> Pack — free Pro, and both `.ac.il` addresses qualify.
>
> 0.7 is `docs/onboarding.md`: install list, first run, five checks that prove the
> environment, where the code lives, and each teammate's first mission.

---

## Epic 1 — Backend foundation ✅

| # | Mission | Size | Owner | Status |
|---|---|---|---|---|
| 1.1 | FastAPI + SQLAlchemy 2.0 (sync) scaffold, ruff config | M | Gal | ✅ |
| 1.2 | Postgres 16 via Docker Compose (host port 5434) | S | Gal | ✅ |
| 1.3 | Alembic migrations, wired to app settings | S | Gal | ✅ |
| 1.4 | JWT auth: register / login / me, Argon2id hashing | M | Gal | ✅ |
| 1.5 | Test harness: per-test transaction rollback, fixtures | M | Gal | ✅ |

---

## Epic 2 — Core domain (Splitwise / Tricount parity)

| # | Mission | Size | Owner | Status |
|---|---|---|---|---|
| 2.1 | `users` + user search by email | S | Gal | ✅ |
| 2.2 | `groups` + `group_members`, roles, `left_at` history | M | Gal | ✅ |
| 2.3 | Expenses CRUD, filters, membership authorization | L | Gal | ✅ |
| 2.4 | Splitting: EQUAL / EXACT / PERCENTAGE / WEIGHT, exact-cent | L | Gal | ✅ |
| 2.5 | Subset participants (only some of the group on an expense) | M | Gal | ✅ |
| 2.6 | `settlements` — recording repayments | M | Gal | ✅ |
| 2.7 | `ExpenseCategory` enum + CHECK constraint | S | Gal | ✅ |
| 2.8 | Seed script with realistic demo data | S | Gal | ✅ |
| 2.9 | **Pagination metadata** (`total`) on list endpoints | S | Gal | ✅ |
| 2.10 | **Cross-group activity feed** for a home screen | M | Gal | ✅ |
| 2.11 | **Receipt image upload + storage** (feeds 5.4) | M | Gal | ✅ |
| 2.12 | Comments / notes thread on an expense | M | Gal | ✅ |
| 2.13 | In-app notifications + reminders | L | Gal | ✅ |

**Epic 2 is complete. Splitwise parity is done.**

Decisions from 2.9–2.13 worth keeping:

- **List endpoints return `Page<T>`, not a bare array.** `total` counts what
  matches the filters, ignoring limit/offset. The page and the count are built
  from the same filter helper — a total that disagrees with its page is worse
  than no total.
- **`created_at` now defaults to `clock_timestamp()`, not `now()`.** `now()` is
  the *transaction's* start time, so several rows written in one transaction get
  identical timestamps and anything ordered by them lands in an arbitrary order.
  A comment thread found this immediately, and Epic 5 would have hit it hard —
  one receipt becomes several expenses in one transaction.
- **Notifications fan out on write**, one row per recipient, inside the
  originating service's transaction. Reads are then a single indexed lookup, and
  an expense can never land without its notifications.
- **Notification wording is not stored.** A row keeps `kind` plus a payload of
  facts; the text is rendered at read time. Hebrew is another branch in one
  function, not a migration.
- **A reminder can only go to someone who owes you**, and the amount comes from
  the settlement plan rather than the request body. A reminder anyone could send
  to anyone for any amount is a harassment feature, not a payments feature.
- **Receipts are served through an authorized endpoint, never a static path**,
  the format is decided by sniffing the bytes rather than trusting
  `Content-Type`, and the storage key is generated from the expense UUID — so
  nothing a user typed ever reaches the filesystem.

---

## Epic 3 — Algorithms

| # | Mission | Size | Owner | Status |
|---|---|---|---|---|
| 3.1 | Balances: `paid − owed + sent − received`, sums to zero | M | Gal | ✅ |
| 3.2 | Min-cash-flow — **provably minimal** to 14 people | L | Gal | ✅ |
| 3.3 | Dynamic weighting via `default_split_weight` | S | Gal | ✅ |
| 3.4 | **Rule engine**: rent by room size, cost by nights stayed | L | Gal | ✅ |

**Epic 3 is complete.**

> 3.4 was the one part of the original spec's "מחשבון שקלול הוצאות דינמי" that
> `WEIGHT` splits did not already cover: rules that apply *automatically* to
> future expenses rather than weights typed per expense.
>
> Weights, not percentages — percentages are weights that must add to 100, so
> supporting both would be two ways of saying one thing. Square metres and
> nights stayed are numbers people already have.
>
> **Whoever names participants wins.** A rule only fills the gap left by not
> naming them, so an expense that says who is on it is never quietly re-split.
> A rule whose members have partly left reweights the rest; one nobody is left
> in is ignored rather than fatal, because falling back to an equal split beats
> refusing to record rent.

---

## Epic 4 — Analytics & intelligence

| # | Mission | Size | Owner | Status |
|---|---|---|---|---|
| 4.1 | Analytics: summary, by-category, by-month, by-member | L | Gal | ✅ |
| 4.2 | Anomaly detection (median + MAD, no AI) | M | Gal | ✅ |
| 4.3 | Text-to-SQL with a sandboxed executor | XL | Gal | ✅ |
| 4.4 | **Verify the Text-to-SQL prompt against the real model** | M | Gal | 🚫 |
| 4.5 | **Duplicate-payment detection** ("did we pay this twice?") | M | Gal | ✅ |
| 4.6 | Budgets per category + over-budget alerts | M | Gal | ✅ |

> 4.4 is blocked on an `ANTHROPIC_API_KEY`. Everything downstream of Claude is
> tested with a stub; the **quality of the generated SQL is currently unmeasured**.
> Build a set of ~20 real questions with expected answers and measure it — that
> evidence is worth a lot in a viva.
>
> 4.5 shipped as **two** things, because "did we pay this twice?" has two
> halves. `Idempotency-Key` on expense and settlement creation stops the network
> kind — a phone that loses a reply and retries. `analytics/duplicates` finds the
> human kind: two people paying the same bill, one person tapping Add twice, a
> bill recorded again under a different name. The three-day window is what keeps
> January rent from being flagged against February rent.
>
> 4.6's alerts fire **once per budget per month per level**. Without that the
> twelfth expense over the line raises a twelfth notification and everyone stops
> reading them.

---

## Epic 5 — AI ingestion (Module 1) ⬜

The largest remaining backend chunk, and the headline "AI" of the project.

| # | Mission | Size | Owner | Status |
|---|---|---|---|---|
| 5.1 | `expense_items` + `item_splits` tables + migration | M | #2 | ⬜ |
| 5.2 | Per-item split API — write into `expense_splits` | L | #2 | ⬜ |
| 5.3 | Receipt upload endpoint + object storage | M | #2 | ✅ |
| 5.4 | Vision OCR: receipt image → items + amounts | L | #2 | ⬜ |
| 5.5 | Review-and-confirm flow for extracted receipts | M | #2 | ⬜ |
| 5.6 | Speech-to-text: audio → transcript | M | #2 | ⬜ |
| 5.7 | Voice NLP: "85₪ cleaning stuff, everyone except Yossi" → expense | L | #2 | ⬜ |
| 5.8 | Gmail OAuth + read-only inbox access | L | #2 | ⬜ |
| 5.9 | Bill extraction from Gmail (incl. PDF attachments) | L | #2 | ⬜ |

**Design constraint, already decided and load-bearing:** items and their splits
must **compute and write ordinary `expense_splits` rows**. Balances, settlement
and analytics must never learn that items exist. Break this and every algorithm
in Epic 3 and 4 needs reworking.

**Order:** 5.1 → 5.2 first. They are pure backend with no AI, and everything
else in this epic writes through them.

**5.3 was delivered as mission 2.11.** Upload, storage, authorized retrieval and
deletion all work; the store sits behind a small interface (`core/storage.py`)
whose only external contract is an opaque key, so moving to object storage is a
deployment task (Epic 10) and touches nothing that reads a receipt. **5.4 starts
from an image that is already on the server.**

---

## Epic 6 — Recurring bills & automation ⬜

| # | Mission | Size | Owner | Status |
|---|---|---|---|---|
| 6.1 | `recurring_bills` table + migration | S | Gal | ✅ |
| 6.2 | Recurring bills CRUD (monthly / every 2 months / quarterly / yearly) | M | Gal | ✅ |
| 6.3 | Generate the next expense when a bill falls due | M | Gal | ✅ |
| 6.4 | Due-date reminders | M | Gal | ✅ |

**Epic 6 is complete.**

> **The distinction the epic turns on:** a bill's `amount` may be null. Rent is
> 3600 every month and posts itself; electricity is whatever the meter says, so
> that bill reminds somebody and never invents a number. A design that only
> handled fixed amounts would have been useless for exactly the bills people
> argue about.
>
> **Nothing runs on a scheduler.** No Celery, no APScheduler — a service to keep
> alive for the sake of a `while` loop. The work is idempotent and triggered
> instead: the app calls `POST .../recurring-bills/run` on load, and
> `backend/run_due_bills.py` is there for a real cron. A bill months overdue
> posts one expense per period it missed.
>
> "Bi-monthly" became **`EVERY_2_MONTHS`**: half the world reads bi-monthly as
> twice a month, and Israeli utility bills arrive every two.
>
> Anomaly detection already groups expenses by title, so recurring bills feed it
> for free — confirmed, no rework was needed.

---

## Epic 7 — Payments (Bit / PayBox) ⬜

| # | Mission | Size | Owner | Status |
|---|---|---|---|---|
| 7.1 | Deep-link builder from a settlement-plan transfer | M | Gal | ⬜ |
| 7.2 | "I paid" confirmation → writes a `settlements` row | S | Gal | ⬜ |
| 7.3 | Phone-number capture and validation (IL format) | S | Gal | ⬜ |

> **Investigate before committing to this.** Bit and PayBox do not publish
> documented deep-link APIs. Spend an hour finding out what actually works on a
> real phone before planning around it; the fallback is a copy-paste amount plus
> phone number, which still closes the loop. `users.phone_number` and
> `SettlementMethod.BIT/PAYBOX` are already in the schema either way.

---

## Epic 8 — AI chat assistant / RAG ⬜

| # | Mission | Size | Owner | Status |
|---|---|---|---|---|
| 8.1 | Chat endpoint with conversation history | M | #2 | ⬜ |
| 8.2 | Tool-use: let the assistant call the analytics endpoints | L | #2 | ⬜ |
| 8.3 | FAISS vector store over expense text | M | #2 | ⬜ |
| 8.4 | RAG: semantic search ("that Italian place in October") | L | #2 | ⬜ |

> **Scope honestly.** Text-to-SQL (4.3) already answers *numerical* questions
> better than RAG would. FAISS/RAG earns its place only for *fuzzy recall* over
> free text — titles and notes — where exact SQL cannot help. Say that
> distinction explicitly in the report rather than building RAG twice over.

---

## Epic 9 — Frontend 🔨

**This is the critical path.** The backend is far ahead of the UI, and a project
with no interface is hard to demo whatever the API does.

| # | Mission | Size | Owner | Status |
|---|---|---|---|---|
| 9.1 | Scaffold: React + Vite + Tailwind + router | M | #3 | ✅ |
| 9.2 | API client + typed models generated from OpenAPI | M | #3 | ✅ |
| 9.3 | Auth screens + token storage + protected routes | M | #3 | ✅ |
| 9.4 | Groups: list, create, members, weights | M | #3 | ✅ |
| 9.5 | Expense list with filters + pagination | M | #3 | ✅ |
| 9.6 | Add / edit expense, all four split types | L | #3 | ✅ |
| 9.7 | Balances screen + settle-up plan | M | #3 | ✅ |
| 9.8 | Charts: category pie, monthly trend, per-member bars | L | #3 | ✅ |
| 9.9 | "Ask" screen for natural-language questions | M | #3 | ⬜ |
| 9.10 | Anomaly alerts surfaced in the UI | S | #3 | ⬜ |
| 9.11 | PWA: manifest, service worker, iOS install | M | #3 | ✅ |
| 9.12 | Android APK wrapper | M | #3 | ⬜ |

> **9 of 12 done.** You can sign in, create a flat, add flatmates and weights,
> add an expense in any of the four split modes, see balances, settle up,
> comment, attach a receipt, read your alerts, see where the money goes, and
> install it to an iOS home screen. What is left is the natural-language Ask
> screen (9.9), anomaly alerts (9.10) and the APK (9.12).
>
> Start from `frontend/README.md`. **The visual identity has landed**: the
> "Kiosk" design from Claude Design is applied — tokens, the eleven shared
> components and all six primary screens. The bet that it would be a one-file
> edit held for the tokens (`src/styles/theme.css` was a drop-in replacement)
> and roughly held for the components, which took one or two lines each. The
> screens were rebuilt, which was always the plan: a token system promises that
> a *recolour* is one file, not that a new layout is.
>
> **Money is a string in every response.** Parse with a decimal library —
> JavaScript numbers cannot hold these values exactly, and a rounding bug in the
> UI will contradict the balances screen.

---

## Epic 10 — Deployment ⬜

| # | Mission | Size | Owner | Status |
|---|---|---|---|---|
| 10.1 | **Ask the lecturer**: hosting allowed? budget? | S | Gal | ⬜ |
| 10.2 | Managed Postgres (Neon / Supabase free tier) | S | Gal | ⬜ |
| 10.3 | Deploy the API (Railway / Render / Fly) | M | Gal | ⬜ |
| 10.4 | Deploy the frontend (Vercel / Netlify) | S | #3 | ⬜ |
| 10.5 | Production secrets: real `JWT_SECRET`, API keys | S | Gal | ⬜ |
| 10.6 | CORS + HTTPS + production settings review | S | Gal | ⬜ |

> 10.1 gates the rest and is one question — ask it this week.
>
> **Do not deploy with the dev JWT secret.** It is committed in `.env.example`
> and anyone reading the repo could forge a token for any account.

---

## Epic 11 — Academic deliverables

| # | Mission | Size | Owner | Status |
|---|---|---|---|---|
| 11.1 | Design decisions recorded as we go (`docs/sessions/`) | S | Gal | ✅ |
| 11.2 | Architecture diagrams: layers, ERD, data flow | M | all | ⬜ |
| 11.3 | Written report | L | all | ⬜ |
| 11.4 | Demo script + seeded demo data | M | all | ⬜ |
| 11.5 | Presentation slides | M | all | ⬜ |

**Things already worth writing up, with the evidence to back them:**

- Min-cash-flow is **provably minimal**, not greedy — measured 0% suboptimal
  across 48,000 cases after replacing a heuristic that was 23.7% suboptimal at
  10 people.
- Exact-cent splitting: `100/3` → `33.34 / 33.33 / 33.33`, verified across every
  total from 0.01 to 4.00 at 8 group sizes.
- Anomaly detection uses **median + MAD**, robust on the ~12 observations a real
  flatshare produces, where mean and standard deviation are dragged around by
  the outlier being hunted.
- The Text-to-SQL sandbox found **two real holes** when probed beyond its own
  test suite (data-modifying CTEs, the `ONLY` modifier) — a much better story
  than "all tests passed".
- `now()` versus `clock_timestamp()`: a comment thread came back in the wrong
  order because Postgres gives every row in a transaction the same `now()`. A
  two-line default change, and a good illustration of a bug that only appears
  when one action writes several rows.
- **A bug that passed every test twice.** `Enum(native_enum=False)` stores a
  VARCHAR plus a CHECK constraint. Adding a member to the Python enum changes
  nothing about the column, so autogenerate writes no migration and
  `alembic check` stays clean — while the database goes on rejecting the value.
  Two enums had drifted. Nothing caught it because the test schema was built
  with `create_all` from the models rather than by migrating. The test database
  is now built by running the migrations, and a test compares every enum against
  its CHECK constraint. Worth writing up as *what our tests were not testing*.
- Min-cash-flow, exact-cent splitting and the sandbox findings above all rest on
  measurements rather than assertions. So does the duplicate detector's
  three-day window, which is the parameter that decides whether it is useful or
  noise.

---

## Suggested order for the next two weeks

**Week 1 — unblock the team**

1. 0.5 — add Hila and Dana in the GitHub web UI *(two minutes, unblocks two
   people, and nothing else on this list matters until it is done)*
2. 9.1–9.3 — frontend scaffold, API client, auth *(#3 starts immediately)*
3. 5.1 + 5.2 — item tables and per-item splits *(#2 starts on pure backend)*
4. 10.1 — ask the lecturer about hosting *(one question, gates Epic 10)*
5. 0.6 — apply for the Student Developer Pack, then run the one command in
   `.github/branch-protection.md`

**The backend is no longer the constraint.** Nothing in Epics 9 or 5 is waiting
on it; both can start the moment 0.5 is done.

**Week 2 — make it demoable**

6. 9.4–9.7 — groups, expenses, balances screens
7. 5.4 + 5.5 — receipt OCR and the review-and-confirm flow *(the headline demo
   moment; upload already works)*
8. 4.4 — measure Text-to-SQL quality once a key exists
9. 10.2 + 10.3 — get it deployed somewhere real

**Deliberately deferred:** Epic 8 (RAG) and 9.12 (APK). Both are real features;
neither is on the path to a working demo.
