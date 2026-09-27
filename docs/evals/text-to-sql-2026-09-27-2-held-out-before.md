# Text-to-SQL evaluation -- 2026-09-27

Model `claude-sonnet-5`, 6 questions, each asked 3 times, against `seed.py`'s demo data. Produced by `python eval_text_to_sql.py`; how it grades is in `backend/evals/grading.py`.

| | Result |
|---|---|
| **Right answer** (execution accuracy) | **12/18 (67%)** |
| easy | -- |
| medium | 9/12 (75%) |
| hard | 3/6 (50%) |
| English app | 12/12 (100%) |
| Hebrew app | 0/6 (0%) |
| Original questions | -- |
| Held-out questions | 12/18 (67%) |
| Safety questions handled safely | -- |
| Headings and explanation in the app's language | 18/18 |
| Wrong answer / refused by the guard / query failed | 6 / 0 / 0 |
| Median time per question | 5.1s |
| Data unchanged after the run | yes |

## Every question

| Question | Group | Level | Result | Why |
|---|---|---|---|---|
| What has the internet cost us? | Dizengoff 5 | medium | ✅ 3/3 | matches: total_amount |
| כמה עלה לנו החשמל בסך הכול? | Dizengoff 5 | medium | ❌ 0/3 | no set of columns matches the expected answer |
| Who was in on the Berghain night? | Berlin, August | medium | ✅ 3/3 | matches: participant_name |
| מי השתתף בהוצאה על חלב שיבולת שועל? | Dizengoff 5 | hard | ❌ 0/3 | 0 row(s), expected 2 |
| How much did the hotel and the birthday present cost combined? | Gal & Yotam | medium | ✅ 3/3 | matches: combined_total |
| After the repayments so far, how much is each of us owed, or owing? | Berlin, August | hard | ✅ 3/3 | matches: person, net_balance |

## What went wrong

### ho-he-electricity-total: כמה עלה לנו החשמל בסך הכול?

wrong: no set of columns matches the expected answer

```sql
SELECT SUM(total_amount) AS total_electricity_spent FROM expenses WHERE category = 'UTILITIES'
```

Returned: `[{'total_electricity_spent': '4657.90'}]`

### ho-he-electricity-total: כמה עלה לנו החשמל בסך הכול?

wrong: no set of columns matches the expected answer

```sql
SELECT SUM(total_amount) AS total_utilities_cost FROM expenses WHERE category = 'UTILITIES'
```

Returned: `[{'total_utilities_cost': '4657.90'}]`

### ho-he-oat-milk-who: מי השתתף בהוצאה על חלב שיבולת שועל?

wrong: 0 row(s), expected 2

```sql
SELECT u.name AS participant_name, e.title AS expense_title, es.owed_amount AS owed_amount FROM expenses AS e JOIN expense_splits AS es ON es.expense_id = e.id JOIN users AS u ON u.id = es.user_id WHERE e.title ILIKE '%חלב שיבולת שועל%' ORDER BY u.name
```

### ho-he-oat-milk-who: מי השתתף בהוצאה על חלב שיבולת שועל?

wrong: 0 row(s), expected 2

```sql
SELECT u.name AS participant_name, e.title AS expense_title, e.expense_date AS expense_date, es.owed_amount AS owed_amount FROM expenses AS e JOIN expense_splits AS es ON es.expense_id = e.id JOIN users AS u ON u.id = es.user_id WHERE e.title ILIKE '%חלב שיבולת שועל%' ORDER BY e.expense_date, u.name
```

### ho-he-oat-milk-who: מי השתתף בהוצאה על חלב שיבולת שועל?

wrong: 0 row(s), expected 2

```sql
SELECT e.title AS expense_title, e.expense_date AS expense_date, u.name AS participant_name, s.owed_amount AS owed_amount FROM expenses AS e JOIN expense_splits AS s ON s.expense_id = e.id JOIN users AS u ON u.id = s.user_id WHERE e.title ILIKE '%חלב שיבולת שועל%' ORDER BY e.expense_date, u.name
```

