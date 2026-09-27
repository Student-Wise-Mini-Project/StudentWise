# StudentWise — Full Roadmap

Everything the project needs, A to Z, split into **epics** (features) and
**missions** (a task one person can finish and merge).

**Status as of 2026-09-27:** 71 endpoints · 18 tables · 873 backend tests ·
336 frontend tests · 14 migrations · CI green.

**New here?** This file is status, not instructions. Start at
[`onboarding.md`](onboarding.md), then [`testing.md`](testing.md), then come
back and pick a ⬜ mission with your name on it.

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
| 0. Ways of working | 6 | 2 | 🔨 invites sent, not yet accepted |
| 1. Backend foundation | 5 | 0 | ✅ complete |
| 2. Core domain (Splitwise parity) | 14 | 0 | ✅ complete |
| 3. Algorithms | 4 | 0 | ✅ complete |
| 4. Analytics & intelligence | 5 | 1 | 🚫 only 4.4, blocked on a key |
| 5. AI ingestion (Module 1) | 9 | 0 | ✅ complete (voice dropped) |
| 6. Recurring & automation | 5 | 0 | ✅ complete |
| 7. Payments (Bit / PayBox) | 0 | 3 | ⬜ not started |
| 8. AI chat assistant / RAG | 0 | 4 | ⬜ not started |
| 9. Frontend | 14 | 3 | 🔨 the app works end to end |
| 10. Deployment | 0 | 6 | ⬜ not started |
| 11. Academic deliverables | 1 | 4 | 🔨 started |
| **Total** | **63** | **23** | |

**The honest read:** the app works end to end. You can sign in, create a flat,
add flatmates and weights, add an expense in any of the four split modes, see
balances, settle up, comment, attach a receipt, read your alerts, see where the
money goes, install it to an iOS home screen and **run the whole thing in
Hebrew**. Epics 1, 2, 3 and 6 are complete, Epic 4 has only its blocked mission
left, and Epic 9 is 14 of 17.

**And since 2026-09-27, the AI headline works:** photograph a receipt, check
what Claude read, tap who had which line, save -- and connect Gmail so utility
bills arrive and split themselves in the right flat. Both were tested on real
input (a real receipt photo; a real PDF in a real inbox). Epic 5 is complete;
voice entry was dropped.

**So the constraint is no longer code — it is the two people who cannot yet see
it.** 0.5 has been the top of this list for days and it is still the only thing
that matters: every branch so far has been merged by its own author, because
there is nobody else with access to approve one. Everything that remains is
either **somebody else's** (Epic 5 ingestion, the last three frontend missions)
or waiting on a decision (Epic 10 hosting) or on a key (4.4).

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
| 0.8 | **Contributor docs**: testing guide, demo accounts, a doc map | S | Gal | ✅ |

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
>
> **0.8 — the seed outgrew the doc that described it.** `onboarding.md` still
> promised one flat and three users when `seed.py` had long since grown to
> seven users and six groups, and it told people to squash-merge, which is the
> opposite of what `CLAUDE.md` says. Both are the same failure as a stale status
> page: documentation nobody re-reads while changing the thing it documents.
>
> So the demo world now has a page of its own, `docs/testing.md` — every
> account, **what each of the six groups exists to prove** (one in euros, one
> Gal does not own, one settled to zero, one Gal is not in at all), the two test
> suites, and what CI will fail you on. `CLAUDE.md`, `README.md` and
> `onboarding.md` all point at it rather than each restating a third of it.
>
> The part worth keeping: the seeded groups are **test fixtures people can click
> through**. Florentin 22 exists so that a group list which forgot its filter is
> visible in one screenful rather than discovered in a viva.

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
| 2.14 | **Close a group** (`archived_at`) + reopen, and what a closed group refuses | M | Gal | ✅ |

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

## Epic 5 — AI ingestion (Module 1) 🔨

The largest remaining backend chunk, and the headline "AI" of the project.

| # | Mission | Size | Owner | Status |
|---|---|---|---|---|
| 5.1 | `expense_items` + `item_splits` tables + migration | M | #3 | ✅ |
| 5.2 | Per-item split API — write into `expense_splits` | L | #3 | ✅ |
| 5.3 | Receipt upload endpoint + object storage | M | #2 | ✅ |
| 5.4 | Vision OCR: receipt image → items + amounts | L | #3 | ✅ |
| 5.5 | Review-and-confirm flow for extracted receipts | M | #3 | ✅ |
| 5.8 | Gmail OAuth + read-only inbox access | L | #3 | ✅ |
| 5.9 | Bill extraction from Gmail (incl. PDF attachments) | L | #3 | ✅ |
| 5.10 | **Route an emailed bill to the right flat** (address, trusted senders, review) | M | #3 | ✅ |
| 5.11 | **Offer to connect Gmail right after sign-up** | S | #3 | ✅ |

**Design constraint, already decided and load-bearing:** items and their splits
must **compute and write ordinary `expense_splits` rows**. Balances, settlement
and analytics must never learn that items exist. Break this and every algorithm
in Epic 3 and 4 needs reworking.

> **5.1–5.5 are done: a receipt can be scanned end to end** (2026-09-27, built
> by #3). Photograph it, check what was
> read, tap the lines each person shared, save. The constraint held: the lines
> are turned into an ordinary `EXACT` split, and nothing downstream changed.
>
> Decisions worth keeping:
>
> - **The scan is stateless.** It returns a draft and stores nothing; the photo
>   is attached after the expense exists. Storing drafts would need something
>   to delete the ones nobody confirmed, and nothing here runs on a scheduler.
> - **A discount is not a line.** It is the gap between the lines and the
>   total, spread in proportion to what each person's lines came to, as a
>   service charge or tip is. Put on a line, it would go to whoever happened to
>   be marked on the discount line.
> - **An unmarked line is stored with every name written out**, not with none,
>   so a receipt does not change meaning when somebody joins the flat later.
> - **The review screen asks the server for per-person totals**
>   (`item-preview`) rather than dividing on the client, so the preview is the
>   same arithmetic as the save.
> - **OCR warnings are codes, not sentences** (`TOTAL_MISSING`, ...), so the
>   Hebrew screen can say them in Hebrew.
>
> **Unmeasured:** how well the model actually reads real receipts. Every test
> stubs the call; like 4.4, it needs an `ANTHROPIC_API_KEY` and a set of real
> receipts with known answers.

> **5.8–5.10 are done: utility bills arrive from Gmail** (2026-09-27, built by
> #3). Connect Gmail read-only, and a bill from a known utility for a flat that
> is certain is split on its own; everything else waits under "Bills to
> review" with the reason. Setup: [`gmail-setup.md`](gmail-setup.md).
>
> Where the original spec was overruled, and why:
>
> - **No Celery.** Nothing here runs on a scheduler. The sync is triggered --
>   opening the app, "Check now", or `fetch_new_bills.py` from cron -- and is
>   safe to repeat because every email is recorded once.
> - **Anthropic, not OpenAI**, through the same `messages.parse` pattern as
>   receipts. Claude reads PDF bills directly.
> - **No `status` on expenses.** Seventeen modules read expenses as money; an
>   unapproved bill would have had to be filtered out of every one. Pending
>   bills live in `ingested_bills` and become ordinary expenses only once their
>   flat is decided.
> - **The bill belongs to the mailbox owner**, not to whoever `billed_to_name`
>   fuzzy-matches: we know whose inbox it came from, and the printed name rarely
>   matches the app name.
> - **Only open shared apartments are candidates.** Counting trips and couples
>   would have made "the user is in one group" almost never true.
> - **House numbers match exactly** before any fuzzy comparison: דיזנגוף 5 and
>   דיזנגוף 50 are one keystroke apart.
> - **Only known utility senders are split unasked.** Anyone can email a
>   convincing "לתשלום"; the domain list is in `config.py`.
> - A **fixed-amount recurring bill** of the same kind sends the email bill to
>   review, since splitting both would charge the month twice.
> - The refresh token is **Fernet-encrypted**, in its own table; the OAuth
>   `state` carries its own JWT audience so it can never be used to sign in.
>
> **Limits worth knowing:** Google's Testing mode expires tokens after 7 days
> (the app asks to reconnect); link-only bills and password-protected PDFs go
> to review with the amount to type. Tested end to end with real Claude on a
> real PDF bill; the real-Google leg needs the setup above.

> **Epic 5 is complete.** Voice entry (speech-to-text, then "85₪ cleaning
> stuff, everyone except Yossi") was dropped on 2026-09-27: receipts and Gmail
> cover how bills actually arrive. 5.11 offers Gmail once, right after
> sign-up, and brings the user back home afterwards.

**5.3 was delivered as mission 2.11.** Upload, storage, authorized retrieval and
deletion all work; the store sits behind a small interface (`core/storage.py`)
whose only external contract is an opaque key, so moving to object storage is a
deployment task (Epic 10) and touches nothing that reads a receipt. **5.4 starts
from an image that is already on the server.**

---

## Epic 6 — Recurring bills & automation ✅

| # | Mission | Size | Owner | Status |
|---|---|---|---|---|
| 6.1 | `recurring_bills` table + migration | S | Gal | ✅ |
| 6.2 | Recurring bills CRUD (monthly / every 2 months / quarterly / yearly) | M | Gal | ✅ |
| 6.3 | Generate the next expense when a bill falls due | M | Gal | ✅ |
| 6.4 | Due-date reminders | M | Gal | ✅ |
| 6.5 | **A bill can run a set number of times** (`occurrences_total`) | M | Gal | ✅ |

**Epic 6 is complete**, and since 9.17 it has a UI. The backend was finished
first and sat unreachable: the tab, the editor and the "repeats" toggle in the
expense form are what turned it into a feature people can use.

> **6.5 — a schedule can now end.** "Twelve months of rent" is a real
> agreement, and until this every bill ran forever: the only way to stop one
> was to remember to delete it. `occurrences_total` is NULL for forever, so
> every existing bill is unchanged, and `occurrences_done` is counted in
> `_post_one` -- the single place an occurrence happens, and *after* the
> IntegrityError guard, so losing the race for one due date does not burn one
> of the twelve.
>
> `is_finished` is derived, and deliberately **not** folded into `active`.
> Pausing is something a person did and can undo; finishing is arithmetic.
> Sharing one flag would mean Resume on a spent bill quietly posts a
> thirteenth rent, which is the one thing the count exists to prevent.
>
> The catch-up loop re-checks the limit every turn rather than once. That loop
> posts one expense per period missed, so a bill five months overdue with two
> left has to stop at two -- it was the one place the count could have been
> walked straight past, and there is a test named after exactly that.
>
> The migration backfills `occurrences_done` from the expenses each bill has
> already posted. Starting everyone at zero would have handed extra months to
> precisely the bills that had been running longest.

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

**Was the critical path; no longer is.** 16 of 17 are done and the app runs
end to end in two languages. What is left is the APK (9.12).

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
| 9.9 | "Ask" screen for natural-language questions | M | #3 | ✅ |
| 9.10 | Anomaly alerts surfaced in the UI | S | #3 | ✅ |
| 9.11 | PWA: manifest, service worker, iOS install | M | #3 | ✅ |
| 9.12 | Android APK wrapper | M | #3 | ⬜ |
| 9.13 | Hebrew + i18n: catalogue, typed `t()`, RTL switch | L | Gal | ✅ |
| 9.14 | Close / delete a group, and a Closed section in the list | M | Gal | ✅ |
| 9.15 | The `+` bar picks a group instead of falling back to the list | S | Gal | ✅ |
| 9.16 | Member suggestions from your other groups | S | Gal | ✅ |
| 9.17 | **Recurring bills UI** — the tab, the editor, and a repeats toggle | L | Gal | ✅ |

> **16 of 17 done.** You can sign in, create a flat, add flatmates and weights,
> add an expense in any of the four split modes, see balances, settle up,
> comment, attach a receipt, read your alerts, see where the money goes, install
> it to an iOS home screen, **and run the whole thing in Hebrew**. Ask a question
> in your own words and get a table back, in the app's language (9.9); an
> unusual bill or a suspected double payment is flagged on Insights and on the
> expense itself (9.10). What is left is the APK (9.12).
>
> **9.14–9.17 came from using the app, not from reading the code**, and three of
> the four were a screen that was never built rather than a decision that was
> never made. Epic 6 had been complete on the backend for two days with no way
> to reach it from the UI — 9.17 is that gap closed, and it is the reason the
> roadmap now carries a frontend mission for a backend epic that was already
> ticked. The `+` bar (9.15) used to hand you the groups list when you were not
> inside a group, which throws away the intention you tapped it with.
>
> **Hebrew is 9.13 and it is done.** The RTL groundwork paid off: the layout
> axis was finished in advance, so this was only the words. No i18n library --
> keys are derived from the English catalogue, so a typo and a missing Hebrew
> string are both `tsc` errors. Notification wording moved from the backend to
> the client, which needed no API change because `NotificationOut` has shipped
> `payload` from the start for exactly that. A third guard test now fails the
> build on a hardcoded string; it found seventeen the translation pass missed.
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

> **Updated 2026-09-27.** Receipts (5.1-5.5) and Gmail bills (5.8-5.10) are
> done, on branches `feat/receipt-ocr` and `feat/gmail-bills`. What matters now:
>
> 1. **Get those two branches reviewed and merged** -- two stacked PRs, a
>    teammate approves each.
> 2. ~~9.9 + 9.10 -- the Ask screen and anomaly alerts~~ -- done 27 Sep, on
>    `feat/ask-and-anomalies` (stacked on `feat/gmail-bills`).
> 3. **Measure the AI on real input** -- ~20 receipts and a handful of real
>    utility bills with known answers, like 4.4 for Text-to-SQL. The key exists
>    now, so 4.4 itself is unblocked too.
> 4. **10.1 -- ask the lecturer about hosting**, then 10.2-10.4.
> 5. **11.2-11.5 -- diagrams, report, demo script, slides.** The session files
>    in `docs/sessions/` are most of the report's raw material.
>
> The original plan follows, for the record.

**Week 1 — get the other two people actually working**

1. **0.5 — chase the invitations.** Still the only thing on this list that
   blocks other humans. Nothing else here matters until Hila and Dana can clone
   the repo.
2. **Both of them: run `docs/onboarding.md` end to end on their own laptop, then
   `docs/testing.md`.** Half a day, and it is the cheapest half-day on the
   project — the alternative is discovering the wrong Python version during the
   week something is due.
3. 5.1 + 5.2 — item tables and per-item splits *(Hila starts on pure backend,
   no AI, no new patterns to learn at the same time)*
4. 9.9 + 9.10 — the Ask screen and anomaly alerts *(Dana; both are new screens
   against endpoints that already exist and are already tested)*
5. 10.1 — ask the lecturer about hosting *(one question, gates all of Epic 10)*
6. 0.6 — apply for the Student Developer Pack, then run the one command in
   `.github/branch-protection.md`

**Nothing on this list is waiting on the backend.** It has not been the
constraint for a week.

**Week 2 — make it demoable**

7. 5.4 + 5.5 — receipt OCR and the review-and-confirm flow *(the headline demo
   moment; upload already works, so this starts from an image on the server)*
8. 4.4 — measure Text-to-SQL quality once a key exists
9. 10.2 + 10.3 — get it deployed somewhere real
10. 11.2 — the architecture diagrams, while the decisions are still fresh

**Deliberately deferred:** Epic 8 (RAG) and 9.12 (APK). Both are real features;
neither is on the path to a working demo.
