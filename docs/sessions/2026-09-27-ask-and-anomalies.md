# The Ask screen and anomaly alerts

**Date:** 2026-09-27
**Branch:** `feat/ask-and-anomalies`, on top of `feat/gmail-bills`
**Missions:** 9.9 and 9.10. Built by #3.

---

## What prompted it

Both endpoints had existed and been tested for weeks (4.1-4.3 Text-to-SQL,
4.5-4.6 anomalies and duplicates) with no way to reach them from the app. The
job was frontend only -- with one backend change, found while testing (below).

## What was built

- **Ask (9.9)** -- `/groups/:groupId/ask`, reached from a card at the top of
  Insights. A question box, four suggestions, and one answer card per
  question, newest first: the explanation, a table, a row count, and "Show how
  it was worked out", which reveals the SQL that ran. Money columns are
  recognised by name (`isMoneyColumn` in `features/analytics/alerts.ts`) and
  shown as money.
- **Worth a look (9.10)** -- a section on Insights, shown only when there is
  something in it: an unusual expense against what it usually costs ("usually
  ₪398.65 · Unusually high · 212% more"), and suspected double payments with
  both halves linked.
- **On the expense itself (9.10)** -- the detail screen says when this is the
  unusual one, or half of a suspected double payment, with a link to the other
  half. It reads the same cached reports as Insights, so it costs no request
  when you arrive from there.
- The floating "Add expense" bar is hidden on Ask, as on the editors -- on a
  phone it sat on the answer being read.

## Decisions

- **The answer comes back in the app's language, not the question's.** The
  first live test asked an English question and got Hebrew headings, because
  the model guessed. `AskRequest.language` (`"en"`/`"he"`) is now sent from
  the locale, and the model writes `explanation` and a new `column_labels` map
  in it. Column *names* stay snake_case English -- they are what the SQL and
  the row keys use. This touched `nl_query_service` (Gal's), with three new
  tests; a model that returns no labels still answers.
- **The duplicate reasons are rebuilt from the pair, not taken from the API.**
  The API's `reasons` are English sentences; the screen derives catalogue keys
  from the pair's own fields (`duplicateReasons`), so they translate.
- **No new endpoints for the alerts.** "Is this expense unusual?" is answered
  from the group reports already fetched for Insights.

## Tested

- 336 frontend tests (30 new: `askAndAlerts.test.tsx`, `alerts.test.ts`) and
  873 backend tests.
- In Edge against the real API and real Claude, on the seeded Dizengoff 5: the
  ₪1,244 electricity bill is flagged on Insights and on its own page; two
  "Internet ₪99.90" expenses by Gal and Maya on one day were flagged as a
  double payment (then deleted); "Who paid the most?" answered in about 6s with
  the right totals, in English and with Hebrew headings in Hebrew.

## What's next

- Merge `feat/receipt-ocr` → `feat/gmail-bills` → this, in order.
- 4.4 -- measure Text-to-SQL on a set of questions with known answers.
- 9.12 -- the APK, the last mission in Epic 9.

## Surprises

- The model is good at the SQL and bad at guessing which language to answer
  in. It needed to be told.
