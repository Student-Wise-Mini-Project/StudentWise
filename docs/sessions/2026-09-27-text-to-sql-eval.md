# Measuring the Ask screen against the real model

**Date:** 2026-09-27
**Branch:** `feat/text-to-sql-eval`
**Mission:** 4.4. Built by #3 (the roadmap had it as Gal's, blocked on a key).

---

## What prompted it

Text-to-SQL had been built and tested for weeks, but every test stubs Claude,
so nobody knew how often an answer was *right*. The key existed since the
receipt work, so the mission was unblocked.

## What was built

- **`backend/evals/`**, a small package outside `app/`:
  - `grading.py` compares *results*, never SQL text. It tolerates renamed,
    reordered and extra columns, row order, number formatting, and how a month
    is written. It does not tolerate a missing or extra row, a wrong value, or
    an id where a name was asked for.
  - `text_to_sql_cases.py` holds 36 questions over five demo groups (easy /
    medium / hard, English and Hebrew), 6 held-out questions and 5 hostile
    ones. Each has a hand-written gold query and, where it can be worked out
    from `seed.py`, the expected answer.
  - `text_to_sql.py` sends each question through `nl_query_service.ask`: the
    real model, guard, scope and read-only transaction, the same path as the
    endpoint.
- **`eval_text_to_sql.py`** (`--repeat`, `--only`, `--held-out`, `--model`,
  `--report`), next to `seed.py` and `run_due_bills.py`.
- **`seed.main(db)`** now accepts a session, so the demo world can be built in
  the test database. `python seed.py` is unchanged.
- **Tests (no key):** `tests/unit/test_eval_grading.py` (22) and
  `tests/api/test_text_to_sql_eval.py` (101). The second checks two things.
  First, **the answer key is right**: every gold query passes the guard and
  returns the hand-worked answer, or matches the analytics and balance services
  where rounding cents make hand-working impractical. Second, **the harness
  grades correctly**: gold SQL passes, while wrong, refused, broken or leaking
  SQL fails, with the right reason.
- **A prompt fix** in `SCHEMA_DOC`, and results in `docs/evals/`.

## What we learned

| | Before | After |
|---|---|---|
| Original 36 questions, x3 | 85% | 99% (107/108) |
| 6 held-out questions, x3 | 67% | 100% |
| 5 hostile questions, x3 | 15/15 safe | 15/15 safe |

The misses were systematic, not random:

1. **A specific bill looked up by its broad category.** "Electricity" was
   answered with every UTILITIES expense.
2. **The payer taken for everyone on an expense.** "Who went diving?" returned
   only the person who paid.
3. **Repayments counted backwards in a balance.** This is the dangerous one:
   the result still sums to zero, so it looks right.
4. **Hebrew questions searched English titles in Hebrew**, and found nothing.
   This was found by the held-out set.

Five lines in the prompt fixed all four.

## Decisions

- **Graded by result, not SQL.** Any correct query passes. That is fairer to
  the model and is what a user sees.
- **Held-out questions before touching the prompt.** They were written after
  the first run, aimed at its weak spots, and measured on the old prompt first.
  Without them, 85% → 99% could just be the prompt memorising 36 questions.
- **The last miss was left alone.** A `LEFT JOIN ... ON` filter bug on one
  question, once in four passes. A prompt line for one question is how an
  evaluation gets overfitted.
- **The test database, not the dev one.** Running the evaluation never touches
  anybody's demo data.
- **Not in CI.** It costs money and needs a key. CLAUDE.md now says to run it
  before merging a `SCHEMA_DOC` change.

## What's next

- The same approach for receipts: about 20 real photos with known totals and
  lines, through `receipt_ocr`.
- Optional: run `--model claude-opus-5` for a cost/accuracy comparison in the
  report.

## Surprises

- The balance bug. The model's balance query was well written and internally
  consistent, and its numbers summed to zero. Only a comparison with the
  balance service showed it was wrong. A person reading the Ask screen would
  have believed it.
