# StudentWise — Project Report

*Draft. Chapters marked **TEAM** can only be written by the team. Everything
else was drafted from the repository (session notes, evaluations, tests) and
should be read, corrected and put into your own voice.*

Live: https://studentwise-4o6d.onrender.com ·
Code: github.com/Student-Wise-Mini-Project/StudentWise

---

## 1. Introduction — TEAM

> *Write this together, about one page:*
> - *The problem you set out to solve: shared money between flatmates, couples
>   and friends on a trip. Who paid, who owes, and the small arguments that
>   follow, often about a single rounding cent.*
> - *Why you chose it, and who it is for.*
> - *What StudentWise does in one paragraph, and what is different from
>   Splitwise or Tricount: AI that reads receipts and bills, questions in
>   plain words, an assistant, and full Hebrew.*

---

## 2. Requirements and scope

The project was planned as twelve epics and 86 missions (`docs/roadmap.md`).
The roadmap is mirrored on a public status page, and a script fails if the two
disagree. The build order was fixed early: **Step 1** database, auth and CRUD;
**Step 2** the algorithms (balances, settling up); **Step 3+** the AI.

| Area | What was built |
|---|---|
| Core | Groups (flat, couple, trip, solo) with members and weights; expenses split four ways (equal, exact, percentage, weight) across any subset of members; settlements; comments; notifications; recurring bills; budgets; closing a group |
| Algorithms | Exact-cent splitting; provably minimal settle-up; a rule engine (for example, rent by room size) |
| Analytics | Totals by category, by month and by person; anomaly detection; duplicate-payment detection |
| AI | Receipt scanning; utility bills from Gmail; questions in plain words (Text-to-SQL); a money assistant with tools; semantic search |
| Payments | Paying a settle-up with Bit or PayBox, and an Israeli phone number in the profile |
| Frontend | A mobile-first installable web app (PWA) in English and Hebrew, plus an Android package |
| Deployment | One Docker image on Render with Neon Postgres |

**Deliberately left out**, each for a stated reason:

- **Voice entry.** Receipts and Gmail already cover how bills actually
  arrive.
- **A scheduler.** Nothing runs on a timer. Due recurring bills and new Gmail
  bills are processed when someone opens the app, and every job is written so
  it can safely catch up.
- **Currency conversion.** A group has one currency, and balances in
  different currencies are never added together.

---

## 3. Architecture

### 3.1 Four layers, and one rule

The backend (Python 3.12, FastAPI, SQLAlchemy 2.0) has exactly four layers,
and nothing imports "upward":

- **api**: HTTP only. It parses, validates, calls a service and returns a
  schema. No SQL.
- **services**: business rules. They **own the transaction**: only services
  commit.
- **repositories**: build queries and add or flush objects. They **never
  commit**.
- **domain**: pure functions, numbers in and numbers out (splitting,
  settlement, anomaly scores, the SQL guard, vector ranking).

The rule that keeps this safe is that repositories never commit. If one did,
an expense could be saved without its splits. Because services own the
transaction, "an expense and the notifications about it land together or not
at all" holds by construction.

`docs/architecture.md` has the diagrams: the layers, the database, the four
ways money enters the ledger, and how the AI reads data.

### 3.2 The database

- **22 tables**, built by **17 Alembic migrations**. Every schema change ships
  with its migration.
- **Money is `NUMERIC(12,2)` and `Decimal`, never a float**, in models,
  schemas and tests alike.
- **Enums are VARCHAR + CHECK**, not native Postgres enums, because those are
  hard to extend.
- **Deletes are hard deletes**: deleting an expense deletes it, and its splits
  cascade.
- **Timestamps use `clock_timestamp()`, not `now()`.** See 8.3 for the bug
  that taught us why.
- **Every list endpoint returns a page** with a `total` built from the same
  filter as the page, so the two cannot disagree.

### 3.3 The frontend

React 19 with Vite, TypeScript and Tailwind, served as an installable PWA.
The API types are **generated** from the backend's OpenAPI schema, and a CI
job regenerates them and fails on any difference. The frontend's equivalent
of "the database matches the models".

Four frontend rules are enforced by tests rather than by review, because none
of them fails loudly on its own:

1. Only the styles folder may name a colour or a font.
2. No physical direction utilities: always logical start/end, so the Hebrew
   right-to-left layout mirrors correctly.
3. The client never divides money. The backend allocates cents, and a second
   implementation would disagree by one.
4. No user-visible string in a component. Every one is a key in the English
   and Hebrew catalogues.

### 3.4 Deployment

One Docker image serves both the API and the built frontend on Render. The
database is Neon Postgres. Three decisions follow from free hosting:

- **Receipt images live in the database**, because a container's disk is
  wiped on every restart.
- **SQL generated by the model runs as a separate read-only database role**,
  on top of the application's own checks.
- **The server refuses to start with unsafe production settings**, such as the
  development JWT secret. Optional keys (Anthropic, Voyage, Google) only
  switch features off.

The lecturer allowed hosting within a $20 budget for the whole project. So
far $5 has been spent, on embedding credit.

---

## 4. The core: splitting and settling

### 4.1 Exact-cent splitting

Splitting ₪100 three ways must give `33.34 / 33.33 / 33.33`, never `99.99`.
StudentWise uses the **largest-remainder method**: every share is rounded
down to the cent, and the leftover cents go to the shares with the largest
remainders. This was verified for every total from ₪0.01 to ₪4.00 across 8
group sizes. The client never does this arithmetic itself, so screen and
server cannot disagree.

### 4.2 Settling up with the fewest transfers

A balance is *paid − owed + repayments sent − repayments received*, and a
group's balances always sum to zero. Settling up means finding the fewest
transfers that bring everyone to zero.

The first version was the common greedy approach: the biggest debtor pays the
biggest creditor. Measured against a brute-force optimum, it was not minimal:

| People | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|
| Greedy, % of cases suboptimal | 0 | 0 | 0 | 0.3 | 1.6 | 4.8 | 11.8 | 23.7 |

It was replaced by an exact method built on one observation:

> minimum transfers = n − (the largest number of disjoint zero-sum subgroups)

A zero-sum subgroup of k people always settles internally in exactly k − 1
transfers. Finding the largest number of such subgroups is NP-hard (it
contains subset-sum), but a flat is not a nation. Up to 14 people it is solved
exactly by dynamic programming over bitmasks. **After the change: 0%
suboptimal at every size from 3 to 10, across 48,000 random cases.** At the
14-person limit it takes about 14 ms on realistic balances and 240 ms on an
adversarial worst case. Above 14 it falls back to greedy.

### 4.3 Rules

A group can have rules such as "rent by room size" (14, 12 and 10 m²), so
every rent expense splits by those weights without anyone typing them.

---

## 5. The AI features

Every AI feature follows two principles:

1. **The model is an input, not a trusted component.** Text in a receipt, an
   email or an expense title is data, never instructions, and every prompt
   says so.
2. **Nothing the model produces touches money until a person or a hard rule
   decides.**

The default model is `claude-sonnet-5`, chosen per feature for cost, with the
fixed part of each prompt cached.

### 5.1 Receipt scanning

A photo of a receipt is read into a merchant, a date and its lines. The person
corrects anything misread, then taps which lines each person shared; a line
nobody marked is split among everyone. The result is an ordinary expense with
an exact split. The lines explain the split; they are not the split. The scan
itself stores nothing. Amounts come back from the model as text and are
parsed into exact decimals, never floats. It was tested on a real Hebrew
supermarket receipt.

### 5.2 Utility bills from Gmail

With read-only consent, the app finds bills in a person's inbox. The model
reads the provider, the amount, the due date and the service address, and the
bill is routed to the right flat by **address**: fuzzy matching on the street,
**exact** matching on the house number. A bill is split automatically only
when all of these hold:

- the sender is a known utility;
- the amount was read;
- exactly one flat matches;
- there is no fixed-amount recurring bill of the same kind;
- the currency matches.

Anything else waits for review, with the reason, because anyone can email a
convincing invoice. Bills that are not yet approved live in their own table,
never as a status on `expenses`, so no money query can ever count them.
Google refresh tokens are encrypted at rest. It was tested end to end with a
real PDF bill in a real inbox.

### 5.3 Ask: questions in plain words (Text-to-SQL)

"Who paid the most this month?" becomes a single read-only SQL query whose
result is shown as a table. The query is shown too, so the answer can be
checked rather than trusted. Because the model is fed user-written titles,
its SQL is treated as hostile, in four layers:

1. **An allowlist checked on the parsed query**, not a regex: one SELECT,
   known tables only, no schema qualification, no catalogue access, no
   password column, no file, network or sleep functions, and no
   data-modifying CTEs.
2. **Group scoping by construction.** The query runs beneath CTEs that shadow
   every table with "only this group's rows". The model never sees the group
   id or supplies it, so even a query with no filter cannot reach another
   group.
3. **A read-only transaction** with a statement timeout and a row cap, always
   rolled back.
4. **A read-only database role** in production.

### 5.4 Unusual expenses and double payments: no AI

Anomalies are found by comparing each expense with its own history (the same
title), using the **median and the median absolute deviation**. With about a
dozen bills, a mean and standard deviation are pulled around by the very
outlier being looked for; the median is not. A series with fewer than five
earlier bills is never flagged. Suspected double payments are pairs within
three days with matching amounts and similar titles. Both are suggestions
only, shown with the reason.

### 5.5 The money assistant

A private conversation, per person per group. Claude answers through **nine
read-only tools**, each a thin call to a service that is already tested:

- the summary
- spending by category, by month and by person
- balances with the settle-up plan
- unusual expenses and possible duplicates
- the expense list
- the Text-to-SQL fallback
- semantic search

So every number it gives is a number the app already computes. **It can
explain a balance but never move one.** Asked to add an expense, it says
where in the app to do that. Only the questions and answers are stored, and
the tools run again on every turn, so a follow-up never reasons from stale
numbers. If no answer comes back, nothing is saved.

### 5.6 Semantic search (retrieval-augmented generation)

"That Italian food night" shares no words with "Pizza night". Each expense's
title, category and note is embedded with Voyage AI (Anthropic does not offer
an embedding model). The vectors are stored in Postgres, and expenses are
ranked by cosine similarity in an exact FAISS index built in memory for each
search. Embeddings are made **lazily**, at search time, never when an expense
is saved, so adding an expense never depends on a third party.

**Scope, stated honestly:** Text-to-SQL answers numerical questions better.
Retrieval earns its place only for fuzzy recall over free text.

---

## 6. Evaluation

The principle throughout: **measure, don't claim.** Unit tests replace the
model with a stub, so they prove the plumbing, not the answers. The answers
were measured separately, against the real model.

### 6.1 Text-to-SQL accuracy

The question set has 36 questions a flatmate would ask, across five groups,
easy to hard, in English and Hebrew, plus 5 hostile ones. Each was asked
three times. The model's result is compared with a hand-written query's
**result**, not its SQL text, so any correct query passes.

| | Original prompt | After a 5-line fix |
|---|---|---|
| Original 36 questions | 85% | **99%** (107/108) |
| 6 held-out questions | 67% | **100%** |
| Hostile questions handled safely | 15/15 | 15/15 |

The first run found **systematic** mistakes, not random ones:

- a specific bill looked up by its broad category;
- the payer taken for everyone who shared an expense;
- **repayments counted backwards in a balance**;
- Hebrew questions searching English titles.

The backwards balance deserves its own mention: the totals still summed to
zero, so they looked right. Only comparing with the app's own balance
calculation exposed it.

The **held-out questions** were written after the first run and measured on
the *old* prompt before it was changed, so the jump from 67% to 100% shows
the fix generalises rather than memorising. A re-check on 6 October scored
42/42. Full reports: `docs/evals/`.

### 6.2 Live tests of every AI feature

| Feature | Real-input test |
|---|---|
| Receipt scanning | A real Hebrew supermarket receipt: every line and the total |
| Gmail bills | A real PDF bill sent to a real inbox, read and routed |
| Assistant | Balances and the settle-up plan matched the app to the agora; asked to add an expense, it refused |
| Semantic search | 5/5 across three groups and both languages ("המלון בצפון" found "Hotel in Haifa"), and confirmed on the live site |

### 6.3 Automated tests and CI

- **About 1,220 backend tests** (pytest) and **403 frontend tests** (Vitest
  with mocked HTTP).
- **CI on every push:** lint, formatting, migrations against the models, the
  test suites, the build, and the generated-types contract.
- **The test database is built by running the migrations**, not from the
  models, which is how one class of bug became impossible (8.3).

### 6.4 Security probing

- The SQL guard was probed beyond its own test suite and **two real holes
  were found and closed**: data-modifying CTEs, which have a SELECT at the
  root yet still write, and the `ONLY` modifier, which reaches past the
  scoping CTEs.
- Prompt injection is tested for every model input.
- User-typed names inside the assistant's instructions are held inside tags
  they cannot close.
- One user's conversation is invisible to another, even inside the same
  group (404, not 403).

---

## 7. Hebrew and accessibility

The interface is fully bilingual. Catalogue keys are derived from the English
file, so a missing Hebrew string is a **compile error**, and a test catches
any string left directly in a component (it found seventeen that a
translation pass had missed). The layout uses logical directions, so it
mirrors correctly in right-to-left.

**Hebrew is gender-neutral by rule.** The app stores no gender, so it writes
"החוב שלך", not "אתה חייב". The AI features were held to the same rule. Live
testing caught the model guessing genders from names ("נועה צריכה לשלם"). The
prompt now has explicit examples, and later replies were neutral, though one
slip ("הילה לא נכנסה") was still seen afterwards and is recorded as a known
limitation.

---

## 8. Engineering process

### 8.1 How the work was organised

- A roadmap of 86 missions, each with a size, an owner and a status, and a
  public status page kept in sync by a script.
- A **session note** for every working session (`docs/sessions/`): what was
  built, what was decided and why, and what surprised us. Most of this report
  was drafted from them.
- One branch per mission, CI on every push, and a written rulebook
  (`CLAUDE.md`) for what makes a change acceptable.

### 8.2 Parallel development with AI coding sessions

In the final phase, several AI coding sessions worked at once, each in its
own git worktree with its own databases:

- the assistant and semantic search;
- deployment;
- payments, plus the Android package;
- one session coordinating merges.

The coordination problems were real ones:

- **Two migration heads.** Two branches each added a migration on the same
  parent. The rule: whichever merges second re-points its migration onto the
  other's.
- **Test merges before every push**, against the then-current main.
- **Cross-session review.** One session reviewed another's code and found a
  real race condition, an embedding saved twice on the first search.
- **Human approval in the session that pushes.** Approval relayed through
  another session did not count.

> **TEAM:** *how this worked in practice: what you decided, what was hard,
> what you would change.*

### 8.3 Bugs worth telling

- **`now()` vs `clock_timestamp()`.** A comment thread came back out of order,
  because Postgres gives every row written in one transaction the same
  `now()`. Fixed with a two-line default change. It is a bug that only
  appears when one action writes several rows.
- **What our tests were not testing.** Adding a value to a Python enum does
  not change the database's CHECK constraint. No migration is generated, and
  `alembic check` stays clean while the database rejects the value. Two enums
  had drifted. Nothing caught it, because the test database was built from
  the models rather than by migrating. It is now built by migrating, and a
  test compares every enum with its constraint.
- **"The page doesn't fit my iPhone."** There was no overflow at all. iOS
  Safari zooms in on any input with a font under 16px and never zooms back
  out. Measuring first stopped us making the wrong fix.
- **Demo data that moved under a test.** The seeded rent bill fell due, and
  opening the group posted it. The assistant's "wrong" answer was right about
  balances that had changed since the test read them.

---

## 9. Limitations and future work

- **Gmail** runs in Google's testing mode, which only works for named test
  users. Opening it to everyone needs Google's verification.
- **Bit and PayBox** publish no deep-link API. Payment opens the app, with a
  copy-the-details fallback.
- **Voyage AI** uses API inputs for training by default. Our account opted out
  on 2026-10-06, but the opt-out only covers data sent after that, so the
  embeddings made in testing that day were sent before it.
- **Gender-neutral Hebrew from the model** is very likely but not guaranteed.
- **No scheduler**, by design. Work catches up when the app is opened.
- **Free hosting** sleeps when idle, so the first request after a while is
  slow.
- **Future work:**
  - per-item receipt splitting by quantity
  - push notifications
  - an iOS App Store build
  - a chat evaluation like the Text-to-SQL one

---

## 10. Reflection — TEAM

> *About one page:*
> - *What each of you did.*
> - *What you learned, technically and about working together and with AI
>   tools.*
> - *What you would do differently.*

---

## Appendices

- **A. Running it:** `docs/onboarding.md` and `docs/deployment.md`.
- **B. The API:** `docs/api-contract.md`.
- **C. The evaluation question set:**
  `backend/evals/text_to_sql_cases.py`, with results in `docs/evals/`.
- **D. The demo script:** `docs/demo-script.md` (mission 11.4).
