# Evaluations — how well the AI actually answers

The automated tests replace Claude with a stub: they prove the plumbing, not the
answers. This folder holds measurements against the **real model**. Each report
is produced by a script and says how it was made. The raw reports sit next to
this page.

## Text-to-SQL, the Ask screen (mission 4.4) — 2026-09-27

`python eval_text_to_sql.py` in `backend/`. It sends 36 questions a flatmate
would ask, across five of the demo groups and in English and Hebrew, plus 5
hostile ones (delete everything, show passwords, another group's data), through
the same path as `POST /analytics/ask`: the real model, the SQL guard, the group
scope, a read-only transaction. Each answer is compared with the result of a
hand-written query. **Results are compared, not SQL text**, so any correct
query passes (see `backend/evals/grading.py`). Every question was asked three
times on `claude-sonnet-5`.

| | Before the prompt fix | After |
|---|---|---|
| **Right answer, original 36 questions** | **92/108 (85%)** | **107/108 (99%)** |
| **Right answer, 6 held-out questions** | 12/18 (67%) | 18/18 (100%) |
| Hostile questions handled safely (5) | 15/15 | 15/15 |
| Data unchanged after the run | yes | yes |
| Median time per question | 3.2s | 3.1s |

The **held-out questions** matter most. They were written after the first run,
aimed at its weak spots but worded differently and asked in other groups, and
they were measured on the *old* prompt before it was changed. They were not
used to tune the prompt, so the 67% → 100% is evidence that the fix
generalises rather than memorising the 36.

### What the model got wrong, and what changed

| Mistake | Where | Before | After |
|---|---|---|---|
| Looked up a specific bill by its broad category -- "electricity" answered with all UTILITIES, water and internet included | average electricity bill; priciest electricity month; water bills (Hebrew) | 0/3 each | 3/3 each |
| Took the payer for everyone on an expense: "who went diving?" answered with who paid for it | Eilat divers | 0/3 | 3/3 |
| Counted repayments the wrong way round in a balance. **The numbers still add up to zero, so they look right** | balances | 0/3 | 3/3 |
| Searched English titles in Hebrew: `ILIKE '%חלב שיבולת שועל%'` finds nothing when the expense is called "Oat milk crate" | held out: oat milk (Hebrew), electricity total (Hebrew) | 0/3 each | 3/3 each |
| Broke a "put together" total down by category | eating out and entertainment | 2/3 | 3/3 |

The fix is five lines in `SCHEMA_DOC` (`app/services/nl_query_service.py`):
who took part in an expense, the balance formula with the direction of a
repayment spelled out, category versus title, titles in either language, and
one row for a combined total.

### What is still wrong

- **One miss in 126 after the fix**: "How much have I spent on the gym?" put the
  title filter in a `LEFT JOIN ... ON` instead of `WHERE`, so it summed all of
  Gal's spending (₪2,322.90, not ₪1,494.00). It passed 3/3 before the change
  and 1 more time in a fourth pass, so it looks like ordinary model variance, not
  something the fix caused. It was not "fixed" with a prompt line for one
  question -- that is how an evaluation gets overfitted.
- **3 of 141 answers were flagged as not in the app's language.** This did not
  happen again in a fourth pass (47/47). It is not diagnosed; the check is a
  simple test for Hebrew letters, and an English explanation that quotes a
  Hebrew search word would trip it.

### Caveats

- The demo data is small (at most 18 expenses a group), so the questions test
  understanding, not performance on large groups.
- 36 + 6 questions is enough to find systematic mistakes, not to quote a
  precise accuracy. The honest summary is "almost always right on questions
  like these", not "99%".
- The expense titles in `seed.py` are English. Real bills from Gmail have Hebrew
  titles, so the both-languages rule matters more in real use than here.

### Reports

1. [`text-to-sql-2026-09-27-1-before.md`](text-to-sql-2026-09-27-1-before.md) -- the original prompt, 36 questions x 3
2. [`text-to-sql-2026-09-27-2-held-out-before.md`](text-to-sql-2026-09-27-2-held-out-before.md) -- the held-out questions on the original prompt
3. [`text-to-sql-2026-09-27-3-after.md`](text-to-sql-2026-09-27-3-after.md) -- the fixed prompt, all 42 questions x 3
