# StudentWise API Contract

Base URL in development: `http://localhost:8000`
Interactive docs (always authoritative): `http://localhost:8000/docs`

Everything below lives under `/api`. This file is the human-readable summary —
if it ever disagrees with `/docs`, `/docs` is generated from the code and wins.

## Conventions

- **Auth**: `Authorization: Bearer <access_token>` on every route except
  `/health`, `/auth/register` and `/auth/login`.
- **Money** is sent and returned as a **string** (`"33.34"`), never a float.
  Parse it with a decimal library on the client; JavaScript numbers cannot hold
  these values exactly.
- **IDs** are UUID strings. **Dates** are `YYYY-MM-DD`. **Timestamps** are ISO-8601 UTC.
- **Errors** always come back as `{"detail": "<message>"}`.
- **List endpoints return a page, not a bare array** (see below).

### Paged lists

Every endpoint that can grow without bound returns the same envelope:

```
Page<T> = { items: T[], total: number, limit: number, offset: number, has_more: boolean }
```

`total` is the number of rows matching **the filters you sent**, ignoring
`limit` and `offset` -- so `?category=UTILITIES&limit=10` gives you ten items and
the true number of utilities expenses. That is what a pager needs, and it is why
these are not bare arrays.

Paged: `/groups/{id}/expenses`, `/groups/{id}/settlements`,
`/expenses/{id}/comments`, `/activity`, `/groups/{id}/activity`,
`/notifications`.

| Status | Meaning |
|---|---|
| 400 | The request made sense but broke a rule (splits don't add up, payer isn't a member) |
| 401 | Missing, invalid or expired token |
| 403 | You are not an active member of that group |
| 404 | It doesn't exist |
| 409 | Conflict (email already registered, user already in the group) |
| 422 | The request body failed validation (wrong types, missing fields, bad enum) |

## Auth

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/register` | `{name, email, password, phone_number?}` | 201 `AuthResponse` |
| POST | `/auth/login` | **form-encoded** `username`, `password` | 200 `AuthResponse` |
| GET | `/auth/me` | — | `User` |

`/auth/login` is form-encoded, not JSON — that's what makes the Authorize button
in `/docs` work. **`username` is the email address.** Password must be ≥ 8 characters.

```
AuthResponse = { access_token: string, token_type: "bearer", user: User }
User = { id, name, email, phone_number, created_at }
```

## Users

| Method | Path | Notes |
|---|---|---|
| GET | `/users/search?email=<fragment>` | Find people to add to a group. Fragment ≥ 3 chars. |

## Groups

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/groups` | — | Groups you're an active member of |
| POST | `/groups` | `{name, type, currency?}` | You become OWNER. `currency` defaults to `ILS` |
| GET | `/groups/{group_id}` | — | Includes `members` |
| PATCH | `/groups/{group_id}` | `{name?, currency?}` | OWNER only |
| DELETE | `/groups/{group_id}` | — | OWNER only. 204. Cascades to expenses and settlements |

`type` is one of `SHARED_APARTMENT`, `COUPLE`, `SOLO`, `TRIP`.

```
Group = { id, name, type, currency, created_by, created_at, members: GroupMember[] }
GroupMember = { user: User, role: "OWNER"|"MEMBER", default_split_weight, joined_at, left_at }
```

## Members

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/groups/{group_id}/members` | `{email}` **or** `{user_id}`, plus `default_split_weight?` | Exactly one identifier |
| PATCH | `/groups/{group_id}/members/{user_id}` | `{default_split_weight}` | Must be > 0 |
| DELETE | `/groups/{group_id}/members/{user_id}` | — | Sets `left_at`; returns the member |

Removal never deletes the row, so past expenses and balances stay correct. A
member who left keeps `left_at != null`, loses access, and cannot join new
splits — but re-adding them revives the same row. Owners can remove anyone;
anyone can remove themselves; the last owner cannot be removed.

## Expenses

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/groups/{group_id}/expenses` | — | Query: `limit`, `offset`, `category`, `payer_id`, `date_from`, `date_to` |
| POST | `/groups/{group_id}/expenses` | `ExpenseCreate` | 201 |
| GET | `/expenses/{expense_id}` | — | |
| PATCH | `/expenses/{expense_id}` | any subset of `ExpenseCreate` | Recomputes splits when needed |
| DELETE | `/expenses/{expense_id}` | — | 204. Hard delete; splits go with it |

```
ExpenseCreate = {
  title, total_amount, expense_date, payer_id,
  split_type?: "EQUAL"|"EXACT"|"PERCENTAGE"|"WEIGHT",   // default EQUAL
  participants?: [{ user_id, share_value? }],           // omit = everyone active
  category?: ExpenseCategory,                           // omit = null
  notes?, source?: "MANUAL"|"VOICE"|"OCR"|"GMAIL_API"
}
```

### Categories

`category` is **optional** and drawn from a **closed set**:

`GROCERIES` · `RENT` · `UTILITIES` · `EATING_OUT` · `ENTERTAINMENT` · `TRANSPORT` · `OTHER`

Anything else is a 422. There is no endpoint for the list because there does not
need to be one — it is in the OpenAPI schema as `components.schemas.ExpenseCategory`,
so a generated client already has it and a dropdown can be built straight from it.

Omitting it stores `null`, meaning "nobody said". Analytics folds `null` in with
`OTHER` so the chart shows one unknown bucket rather than two.

It is a closed set precisely because the charts depend on it: with free text,
"super", "Super" and "supermarket" become three slices of the same pie and
month-over-month comparison quietly breaks. When the AI ingestion modules land
they will map their free-form guess onto one of these values and keep the raw
text in `ai_metadata`.

`GET /groups/{id}/expenses?category=UTILITIES` filters by it.

### How splitting works

**Omitting `participants` includes every active member.** Passing a subset is how
you record "I bought this, but only two of us are in on it".

`share_value` means something different per `split_type`:

| split_type | `share_value` means | Rule |
|---|---|---|
| `EQUAL` | ignored | — |
| `EXACT` | the amount that person owes | must add up to `total_amount` |
| `PERCENTAGE` | a percentage | must add up to 100 |
| `WEIGHT` | a relative weight | must be > 0; omit it and the member's `default_split_weight` is used |

Splits always sum to **exactly** `total_amount`. `100.00` between three people
returns `33.34 / 33.33 / 33.33` — the leftover cent is handed to the largest
remainder, deterministically. Never re-derive splits on the client.

**On PATCH**, the original participants are kept unless you send new ones, so
changing an amount will not spread the expense across the whole group.

```
Expense = {
  id, group_id, payer: User, title, total_amount, category, expense_date,
  split_type, source, notes, receipt_url, ai_metadata,
  created_by, created_at, updated_at,
  splits: [{ user: User, owed_amount, share_value }]
}
```

`receipt_url` is `null` until a receipt is uploaded, and otherwise the path to
fetch it (see below). `ai_metadata` is always `null` for now; the Step 3 AI
ingestion modules will populate it.

### Receipts

| Method | Path | Body | Notes |
|---|---|---|---|
| PUT | `/expenses/{expense_id}/receipt` | multipart `file` | Returns the updated `Expense` |
| GET | `/expenses/{expense_id}/receipt` | -- | The image itself |
| DELETE | `/expenses/{expense_id}/receipt` | -- | Returns the updated `Expense` |

JPEG, PNG or WebP, up to 5 MB. **The server identifies the format from the bytes,
not from the `Content-Type` you send** -- a `.png` that is really a script is a
400, whatever the header says.

PUT rather than POST because an expense has exactly one receipt: uploading again
replaces it, and no second receipt appears.

`GET` returns the raw image and needs the same `Authorization` header as every
other route -- receipts are not on a public path, because they show what people
bought and where they were. In an `<img>` tag that means fetching the blob
yourself rather than pointing `src` straight at the URL.

404 if the expense has no receipt. Deleting the expense deletes the file.

## Settlements

Recording that someone actually paid someone back.

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/groups/{group_id}/settlements` | — | Query: `limit`, `offset` |
| POST | `/groups/{group_id}/settlements` | `{from_user_id, to_user_id, amount, method?, note?, settled_at?}` | 201 |
| GET | `/settlements/{settlement_id}` | — | |
| DELETE | `/settlements/{settlement_id}` | — | 204. Undo a mistaken entry |

`method` is `MANUAL`, `BIT` or `PAYBOX` (default `MANUAL`). `from_user_id` and
`to_user_id` must differ, `amount` must be > 0, and both people must belong to
the group — including someone who has left, since leaving does not erase a debt.

## Comments

A thread hanging off one expense -- where "this was only me and Dana" gets said.

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/expenses/{expense_id}/comments` | -- | `Page<Comment>`, **oldest first** |
| POST | `/expenses/{expense_id}/comments` | `{body}` | 201 |
| PATCH | `/comments/{comment_id}` | `{body}` | Author only |
| DELETE | `/comments/{comment_id}` | -- | 204. Author, or a group OWNER |

```
Comment = { id, expense_id, user: User, body, created_at, edited_at }
```

Any member of the group can comment, including someone who is not on the
expense -- "why am I not on this?" is exactly the comment worth allowing.

`edited_at` is `null` until the text actually changes, so the UI can show
"edited". Re-sending identical text is not an edit. An unmarked edit would let
someone rewrite what they agreed to, which defeats the point of the feature.

A thread reads oldest-first, unlike everything else here, because that is how a
conversation reads. Comments are deleted with their expense.

Body is 1-2000 characters; whitespace-only is a 400.

## Activity

| Method | Path | Notes |
|---|---|---|
| GET | `/activity` | Everything across every group you are in, newest first |
| GET | `/groups/{group_id}/activity` | The same, for one group |

```
Activity = {
  kind: "EXPENSE_ADDED" | "SETTLEMENT_RECORDED",
  occurred_at, group_id, group_name, currency,
  expense: Expense | null, settlement: Settlement | null   // exactly one, per kind
}
```

This is what a home screen is built from. Each item carries the **whole** row, so
a feed can be rendered and a row opened without a second request.

Ordered by when things were entered, not by `expense_date` or `settled_at` --
those are user-supplied and can be backdated, and a bill entered today for last
month belongs at the top. Leaving a group removes it from your feed; the
expenses themselves are untouched and still count towards that group's balances.

`limit` caps at 100 here.

## Notifications

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/notifications` | -- | `Page<Notification>`, newest first. Query: `unread_only` |
| GET | `/notifications/unread-count` | -- | `{unread: number}` |
| POST | `/notifications/{notification_id}/read` | -- | Returns the notification |
| POST | `/notifications/read-all` | -- | `{marked_read: number}` |
| POST | `/groups/{group_id}/reminders` | `{debtor_ids?}` | 201, a list of `Notification` |

```
Notification = {
  id, kind, title, body, group_id, actor: User | null,
  expense_id, settlement_id, payload, read_at, created_at
}
```

`kind` is `EXPENSE_ADDED`, `COMMENT_ADDED`, `SETTLEMENT_RECORDED` or
`PAYMENT_REMINDER`.

Who gets told what:

- **an expense** -- everyone on it, except whoever entered it
- **a comment** -- everyone on the expense, plus anyone already in the thread
- **a settlement** -- the other person
- **a reminder** -- the person who owes

**`title` and `body` are rendered per request, not stored**, and they are English
for now. `payload` carries the same facts in structured form (`actor_name`,
`owed_amount`, `currency`, ...), so a Hebrew UI can write its own wording without
parsing English. Money in `payload` is a string, like everywhere else.

Marking as read does not delete anything. A notification belonging to someone
else is a 404, not a 403 -- saying "forbidden" would confirm the id exists.

### Reminders

`POST /groups/{id}/reminders` nudges the people who owe **you** in that group.
Send `{}` for everyone who owes you, or `{"debtor_ids": [...]}` for specific
people.

You cannot remind someone who does not owe you (400), and **the amount comes
from the settlement plan, not from the request** -- so a reminder always matches
what the balances screen says. A reminder anyone could send to anyone for any
amount would be a harassment feature, not a payments feature.

400 if nobody in the group owes you anything.

## Balances

| Method | Path | Notes |
|---|---|---|
| GET | `/groups/{group_id}/balances` | Who is up and who is down, net of everything |
| GET | `/groups/{group_id}/settlement-plan` | Fewest transfers that would square the group up |

```
GroupBalances = { group_id, currency, balances: UserBalance[] }
UserBalance = { user: User, paid, owed, settlements_sent, settlements_received, net }
```

`net = paid - owed + settlements_sent - settlements_received`.
**Positive means the group owes them; negative means they owe the group.** The
nets always sum to exactly zero — if they ever don't, that's a bug, and the
settlement-plan endpoint will return 400 rather than invent money.

Rows are sorted richest creditor first. Someone who has left the group still
appears while their net is non-zero, and drops off once they are square.

```
SettlementPlan = { group_id, currency, transfers: [{ from_user, to_user, amount }] }
```

**The plan is a suggestion — it writes nothing.** To record that a transfer
actually happened, POST it to `/groups/{id}/settlements`; that is what moves the
balances. An empty `transfers` list means everyone is square.

The plan is the **provably minimum** number of transfers for groups of up to 14
people with a non-zero balance, which covers every realistic flat, couple or
trip. Above 14 it falls back to a greedy heuristic that still never exceeds
*(people with a non-zero balance) − 1* transfers, but is no longer guaranteed
shortest — finding the true minimum in general is NP-hard (subset-sum).

## Analytics

All read-only, all under `/groups/{group_id}/analytics/`. Every one accepts
`date_from` and `date_to` (inclusive, on `expense_date`).

| Path | Returns |
|---|---|
| `summary` | Headline numbers: total, count, average, largest expense, date range |
| `by-category` | Spend per category, biggest first, with percentage shares |
| `by-month` | Monthly totals for a trend chart, oldest first |
| `by-member` | Per person: what they paid out vs what they consumed |

### Scope: group vs personal

`summary`, `by-category` and `by-month` accept a **`user_id`** parameter, and the
number it returns changes meaning:

- **without `user_id`** — what the *group* spent: the sum of expense totals.
- **with `user_id`** — what that *person* consumed: the sum of their own split
  shares, skipping expenses they were not part of.

A 90.00 dinner split three ways is `90.00` of group spending but `30.00` of
personal spending. The response echoes `scope: "group" | "user"` so the client
can label the chart correctly. Passing a `user_id` who is not a group member is
a 400.

### Notes worth knowing

- **`by-month` fills empty months with zero.** If the group spent in June and
  September but not July or August, you get all four months back. Drawing a line
  chart straight from raw database rows would join June to September and imply
  spending that never happened.
- Categories come from the fixed `ExpenseCategory` set. Expenses with no
  category are merged into the `OTHER` bucket rather than shown separately.
- **`by-member` is not `/balances`.** It is a spending breakdown (`paid` and
  `consumed`) and nets nothing off against settlements. For who owes whom, use
  `/balances`.
- `share_percent` is to one decimal place and sums to ~100 for a non-empty group.

```
Summary        = { group_id, currency, scope, total_spent, expense_count,
                   average_expense, largest_expense, first_expense_date, last_expense_date }
CategoryBreakdown = { group_id, currency, scope, total,
                      categories: [{ category, total, expense_count, share_percent }] }
MonthlyTrend   = { group_id, currency, scope, months: [{ month: "YYYY-MM", total, expense_count }] }
MemberBreakdown = { group_id, currency, members: [{ user, paid, consumed }] }
```

### Anomalies

`GET /groups/{group_id}/analytics/anomalies` — expenses that don't look like
their own history, worst first. Accepts `direction` (`HIGH` / `LOW`),
`date_from` and `date_to`.

```
AnomalyReport = { group_id, currency, anomalies: [{
  expense, series_label, series_size,
  baseline, difference, percent_change, score, direction
}] }
```

**Series are grouped by title**, normalised for case and spacing — so
"Electricity bill" is judged against previous electricity bills, not against the
weekly shop. Category would be too coarse: `UTILITIES` mixes water, electricity
and gas, and their combined spread hides a spike in any one of them.

A title needs **at least five** occurrences before any of them can be flagged. A
one-off expense is therefore never an anomaly however large it is — there is no
history to judge it against. `series_size` tells you how much history there was.

`baseline` is the median of the series' *other* observations, so the reading
under test never props up its own baseline. Every anomaly is explainable from
the response alone: *1244.00 against a usual 398.65, +212.1%*.

**`date_from` / `date_to` narrow what is reported, not what the baseline is
built from.** Asking for just last month still compares against the full history.

No AI is involved. It is a median + median-absolute-deviation test, which stays
meaningful on the dozen or so observations a real flatshare produces.

### Ask a question (natural language)

`POST /groups/{group_id}/analytics/ask` with `{"question": "..."}` (3-500 chars).

```
AskResponse = { question, sql, explanation, columns, rows, row_count, truncated }
```

Claude translates the question into a single PostgreSQL SELECT. **The SQL that
ran comes back in the response** — show it, so an answer can be checked rather
than trusted. `rows` are plain objects keyed by column name; money is a string
like everywhere else, and UUIDs/dates are ISO strings.

Returns **503** when the server has no `ANTHROPIC_API_KEY`, and **400** when the
generated SQL is refused by the guard (the message says why).

**How it is kept safe.** The model is treated as an untrusted input, not a
trusted component — remember it is fed user-written expense titles:

1. The SQL is parsed and checked against an allowlist (single read-only SELECT,
   known relations only, no schema qualification, no catalog access, no
   `password_hash`, no file/network/sleep functions, and no data-modifying CTEs).
2. It is then wrapped beneath server-injected CTEs that expose only this group's
   rows. **The model never sees or supplies the group id**, so a query with no
   filter at all still cannot reach another group.
3. It runs in a READ ONLY transaction with a statement timeout and a row cap,
   and is always rolled back.

`truncated: true` means there were more rows than the server returns.

## Not built yet (Step 3+)

Do not build UI against these; they don't exist:

- Receipt **OCR** (uploading a receipt image works; reading one does not),
  voice entry, Gmail scraping, per-item splitting
- Bit / PayBox deep links
- Recurring bills, budgets, duplicate-payment detection

## Demo data

`python seed.py` (from `backend/`) creates the flat "Dizengoff 5" with
`gal@`, `maya@` and `noa@studentwise.dev`, password `password123`, eighteen
expenses covering every split type (including six months of electricity and
water so the anomaly endpoint has history), one Bit settlement, a two-message
comment thread, and the notifications all of that raised.
