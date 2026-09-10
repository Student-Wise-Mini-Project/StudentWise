# StudentWise — Full Roadmap

Everything the project needs, A to Z, split into **epics** (features) and
**missions** (a task one person can finish and merge).

**Status as of 2026-09-10:** 30 endpoints · 6 tables · 337 tests · 4 migrations ·
13 commits · CI green.

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
| 0. Ways of working | 4 | 3 | mostly done |
| 1. Backend foundation | 5 | 0 | ✅ complete |
| 2. Core domain (Splitwise parity) | 8 | 5 | mostly done |
| 3. Algorithms | 3 | 1 | mostly done |
| 4. Analytics & intelligence | 3 | 3 | mostly done |
| 5. AI ingestion (Module 1) | 0 | 9 | ⬜ not started |
| 6. Recurring & automation | 0 | 4 | ⬜ not started |
| 7. Payments (Bit / PayBox) | 0 | 3 | ⬜ not started |
| 8. AI chat assistant / RAG | 0 | 4 | ⬜ not started |
| 9. Frontend | 0 | 12 | ⬜ not started |
| 10. Deployment | 0 | 6 | ⬜ not started |
| 11. Academic deliverables | 1 | 4 | started |
| **Total** | **24** | **54** | |

**The honest read:** the backend's *thinking* parts are done — splitting,
balances, min-cash-flow, analytics, anomalies, Text-to-SQL. What is left is
mostly **breadth**: a frontend that does not exist yet, AI ingestion, and
deployment. Epic 9 is the critical path to having something demoable.

---

## Epic 0 — Ways of working

| # | Mission | Size | Owner | Status |
|---|---|---|---|---|
| 0.1 | Git repo, `main` branch, monorepo layout | S | Gal | ✅ |
| 0.2 | `CLAUDE.md` — stack, layering rule, code standards | S | Gal | ✅ |
| 0.3 | End-of-session summaries in `docs/sessions/` | S | Gal | ✅ |
| 0.4 | CI: ruff + `alembic check` + pytest on every push | S | Gal | ✅ |
| 0.5 | Add teammates as GitHub collaborators | S | Gal | ⬜ |
| 0.6 | Protect `main`: require PR + 1 review + green CI | S | Gal | ⬜ |
| 0.7 | Onboarding doc: clone → running app in 10 minutes | S | Gal | ⬜ |

> 0.5 needs your teammates' GitHub usernames. Until then they cannot contribute
> at all, which makes it the highest-value 10 minutes in this table.

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
| 2.9 | **Pagination metadata** (`total`) on list endpoints | S | Gal | ⬜ |
| 2.10 | **Cross-group activity feed** for a home screen | M | Gal | ⬜ |
| 2.11 | **Receipt image upload + storage** (feeds 5.2) | M | Gal | ⬜ |
| 2.12 | Comments / notes thread on an expense | M | Gal | ⬜ |
| 2.13 | In-app notifications + reminders | L | Gal | ⬜ |

> 2.9 and 2.10 are small and unblock the frontend: without `total` nobody can
> build a pager, and without a feed there is no home screen.

---

## Epic 3 — Algorithms

| # | Mission | Size | Owner | Status |
|---|---|---|---|---|
| 3.1 | Balances: `paid − owed + sent − received`, sums to zero | M | Gal | ✅ |
| 3.2 | Min-cash-flow — **provably minimal** to 14 people | L | Gal | ✅ |
| 3.3 | Dynamic weighting via `default_split_weight` | S | Gal | ✅ |
| 3.4 | **Rule engine**: rent by room size, cost by nights stayed | L | Gal | ⬜ |

> 3.4 is the one part of your original spec's "מחשבון שקלול הוצאות דינמי" that
> `WEIGHT` splits do not already cover: rules that apply *automatically* to
> future expenses rather than weights typed per expense.

---

## Epic 4 — Analytics & intelligence

| # | Mission | Size | Owner | Status |
|---|---|---|---|---|
| 4.1 | Analytics: summary, by-category, by-month, by-member | L | Gal | ✅ |
| 4.2 | Anomaly detection (median + MAD, no AI) | M | Gal | ✅ |
| 4.3 | Text-to-SQL with a sandboxed executor | XL | Gal | ✅ |
| 4.4 | **Verify the Text-to-SQL prompt against the real model** | M | Gal | 🚫 |
| 4.5 | **Duplicate-payment detection** ("did we pay this twice?") | M | Gal | ⬜ |
| 4.6 | Budgets per category + over-budget alerts | M | Gal | ⬜ |

> 4.4 is blocked on an `ANTHROPIC_API_KEY`. Everything downstream of Claude is
> tested with a stub; the **quality of the generated SQL is currently unmeasured**.
> Build a set of ~20 real questions with expected answers and measure it — that
> evidence is worth a lot in a viva.
>
> 4.5 is explicitly in your spec ("check double payment") and is *not* the same
> as 4.2: a duplicate is two similar expenses close together, not a statistical
> outlier.

---

## Epic 5 — AI ingestion (Module 1) ⬜

The largest remaining backend chunk, and the headline "AI" of the project.

| # | Mission | Size | Owner | Status |
|---|---|---|---|---|
| 5.1 | `expense_items` + `item_splits` tables + migration | M | #2 | ⬜ |
| 5.2 | Per-item split API — write into `expense_splits` | L | #2 | ⬜ |
| 5.3 | Receipt upload endpoint + object storage | M | #2 | ⬜ |
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

---

## Epic 6 — Recurring bills & automation ⬜

| # | Mission | Size | Owner | Status |
|---|---|---|---|---|
| 6.1 | `recurring_bills` table + migration | S | Gal | ⬜ |
| 6.2 | Recurring bills CRUD (monthly / bi-monthly / yearly) | M | Gal | ⬜ |
| 6.3 | Generate the next expense when a bill falls due | M | Gal | ⬜ |
| 6.4 | Due-date reminders | M | Gal | ⬜ |

> Anomaly detection already groups expenses by title, so recurring bills feed it
> for free — no rework needed there.

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

## Epic 9 — Frontend ⬜

**This is the critical path.** The backend is far ahead of the UI, and a project
with no interface is hard to demo whatever the API does.

| # | Mission | Size | Owner | Status |
|---|---|---|---|---|
| 9.1 | Scaffold: React + Vite + Tailwind + router | M | #3 | ⬜ |
| 9.2 | API client + typed models generated from OpenAPI | M | #3 | ⬜ |
| 9.3 | Auth screens + token storage + protected routes | M | #3 | ⬜ |
| 9.4 | Groups: list, create, members, weights | M | #3 | ⬜ |
| 9.5 | Expense list with filters + pagination | M | #3 | ⬜ |
| 9.6 | Add / edit expense, all four split types | L | #3 | ⬜ |
| 9.7 | Balances screen + settle-up plan | M | #3 | ⬜ |
| 9.8 | Charts: category pie, monthly trend, per-member bars | L | #3 | ⬜ |
| 9.9 | "Ask" screen for natural-language questions | M | #3 | ⬜ |
| 9.10 | Anomaly alerts surfaced in the UI | S | #3 | ⬜ |
| 9.11 | PWA: manifest, service worker, iOS install | M | #3 | ⬜ |
| 9.12 | Android APK wrapper | M | #3 | ⬜ |

> `docs/api-contract.md` and `/docs` already describe every endpoint, so 9.1–9.3
> can start today with no further backend work.
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

---

## Suggested order for the next two weeks

**Week 1 — unblock the team**

1. 0.5 + 0.6 — add teammates, protect `main` *(10 minutes, unblocks two people)*
2. 9.1–9.3 — frontend scaffold, API client, auth *(#3 starts immediately)*
3. 5.1 + 5.2 — item tables and per-item splits *(#2 starts on pure backend)*
4. 2.9 + 2.10 — pagination totals and activity feed *(Gal, small, unblocks 9.5)*
5. 10.1 — ask the lecturer about hosting *(one question, gates Epic 10)*

**Week 2 — make it demoable**

6. 9.4–9.7 — groups, expenses, balances screens
7. 5.3 + 5.4 — receipt upload and OCR *(the headline demo moment)*
8. 4.4 — measure Text-to-SQL quality once a key exists
9. 10.2 + 10.3 — get it deployed somewhere real

**Deliberately deferred:** Epic 8 (RAG), 9.12 (APK), 6.4 and 2.13 (reminders),
3.4 (rule engine). All are real features, none is on the path to a working demo.
