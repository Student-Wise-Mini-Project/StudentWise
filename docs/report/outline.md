# StudentWise: report outline (mission 11.3)

The skeleton for the written report, and for the slides (11.5), which follow
the same order. Each chapter names its sources in the repo, its evidence (the
numbers worth quoting), and who writes it.

> **Check first:** the lecturer has not said what format or length the report
> should be (question 7 of the hosting email). Ask, and adjust before writing
> in full. Target until then: about 20-25 pages plus an appendix.

**Who writes what.** *Draft* means a Claude session writes it from the sources
and the team edits it. *Team* means it can only come from you: how you
worked, what you decided as people, what you learned.

---

## 1. Introduction (1 page). Team

- The problem: shared money among flatmates, couples and trips. Who paid,
  who owes, and why one cent of rounding becomes an argument.
- What StudentWise is, in one paragraph, with a link to the live site:
  https://studentwise-4o6d.onrender.com
- What is different from Splitwise or Tricount: the AI layer (receipts,
  Gmail bills, questions in plain words, an assistant) and full Hebrew.

## 2. Requirements and scope (1-2 pages). Draft

- Sources: `docs/roadmap.md` (epics 0-11), `CLAUDE.md` ("Step 1/2/3").
- What was built: 80+ of 86 missions, by epic.
- What was deliberately dropped, and why:
  - voice entry (5.6/5.7): receipts and Gmail cover how bills arrive
  - a scheduler: nothing runs on a timer; work catches up when the app opens
  - FX: currency lives on the group

## 3. Architecture (3-4 pages). Draft

- Sources: `docs/architecture.md` (the diagrams for 11.2), `CLAUDE.md`
  ("four layers").
- The four layers (api / services / repositories / domain), and the one rule
  that keeps them safe: **repositories never commit**.
- The database: 22 tables, why money is `NUMERIC(12,2)` and never a float,
  why enums are VARCHAR + CHECK, and why deletes are hard deletes.
- Frontend: React PWA; types generated from OpenAPI (the `contract` CI job);
  four rules enforced by tests, not review.
- Deployment: one Docker image on Render plus Neon Postgres; receipts in the
  database because the disk is wiped; a read-only database role for
  generated SQL. Source: `docs/deployment.md`.

## 4. The core: splitting and settling (2-3 pages). Draft

- Sources: sessions `2026-09-10-*`, `domain/splitting.py`,
  `domain/settlement_algo.py`, and the "Things already worth writing up" list
  in `docs/roadmap.md`.
- **Evidence:**
  - Largest-remainder splitting: `100/3` = `33.34/33.33/33.33`, verified for
    every total from 0.01 to 4.00 at 8 group sizes.
  - Minimum transfers to settle up: **provably minimal**, 0% suboptimal across
    48,000 cases, replacing a greedy version that was 23.7% suboptimal at 10
    people.
  - The rule engine: rent by room size.

## 5. The AI features (5-6 pages). Draft

One section per feature: what it does, how trust is handled, and the
evidence.

1. **Receipt scanning.** A photo becomes lines; you mark who shared what.
   Nothing touches money until a person confirms it. Source:
   `2026-09-27-receipt-ocr.md`.
2. **Bills from Gmail.** An email is read and routed to the right flat by
   address, with exact house numbers. A bill is split automatically only from
   a trusted sender; everything else goes to review. Source:
   `2026-09-27-gmail-bills.md`.
3. **Ask (Text-to-SQL).** A question becomes one SELECT, behind an AST
   allowlist, group-scoped CTEs and a read-only transaction. Sources:
   `nl_query_service`, `domain/sql_guard.py`.
4. **Anomalies and duplicates.** Median and MAD, with no AI at all, and why
   that beats mean and standard deviation on 12 data points.
5. **The money assistant.** Nine read-only tools; it can explain a balance but
   never move one. Source: `2026-10-06-ai-chat.md`.
6. **Semantic search (RAG).** Voyage embeddings plus FAISS. Be honest about
   scope: Text-to-SQL answers numbers better, and RAG is for fuzzy recall.
   Source: `2026-10-06-semantic-search.md`.

**Model cost:** `claude-sonnet-5` by default, with caching of the system
prompt.

## 6. Evaluation (3 pages). Draft. *The strongest chapter: measure, don't claim.*

- Sources: `docs/evals/README.md` and the three reports, `docs/testing.md`.
- **Text-to-SQL:**
  - 85% to 99% after a five-line prompt fix
  - held-out questions: 67% to 100%, which shows the fix generalises
  - the balance-sign bug that "looked right because it summed to zero"
- **Live tests:**
  - receipt OCR on a real receipt
  - a real PDF bill in a real inbox
  - chat balances checked against the app to the cent
  - semantic search: 5/5 in two languages
- **Automated tests:** about 1,200 backend and 400 frontend (quote the final
  numbers); CI; guards for colours, RTL and bare strings.
- **Security probing:** the SQL sandbox found two real holes (data-modifying
  CTEs, `ONLY`); prompt-injection tests; user-typed names held inside tags.

## 7. Internationalisation and accessibility (1 page). Draft

- A Hebrew and English catalogue checked by the type system, the RTL guard,
  and gender-neutral Hebrew (and the model slips caught in testing).

## 8. Engineering process (2 pages). Draft + team

- Session notes (`docs/sessions/`), the roadmap with its sync check, CI, and
  branch-per-mission.
- **Parallel work:** several Claude sessions in separate git worktrees, with
  one coordinator and one reviewer. The process: migration chaining (two
  heads, re-pointed), test merges before every push, and approval from the
  person in the pushing session. *Team: how this felt, what went wrong.*
- Bugs worth telling:
  - `now()` vs `clock_timestamp()`
  - enum CHECK drift that `alembic check` could not see, fixed by building the
    test database from migrations
  - the iPhone auto-zoom that looked like a layout bug

## 9. Limitations and future work (1 page). Draft

- Gmail runs in Google's "testing" mode (named test users only).
- Bit/PayBox have no documented deep-link API.
- Voyage can train on API inputs unless the opt-out is on.
- Hebrew gender slips are rare but not zero.
- No scheduler.
- The free hosting plan sleeps when idle.

## 10. Reflection (1 page). Team

- What each person did, what you learned, and what you would do differently.

## Appendices

- A. How to run it (point to `docs/onboarding.md`) and the live link.
- B. The API summary (`docs/api-contract.md`).
- C. The evaluation question set (`backend/evals/text_to_sql_cases.py`).
- D. The demo script (11.4, `docs/demo-script.md`).

---

## Slides (11.5): one slide per point, in this order

1. Title and the problem
2. A demo moment: scan a receipt
3. Architecture in one picture
4. Splitting and settling, with the minimality result
5. AI: receipts, Gmail, Ask, the assistant
6. **Trust:** what the AI can and cannot touch
7. Evaluation: 85% → 99%, and the held-out 67% → 100%
8. Hebrew and mobile
9. How we built it (sessions, CI, parallel worktrees)
10. Limitations, then thanks
