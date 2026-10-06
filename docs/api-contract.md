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

### Generating a client from `/openapi.json`

The frontend does this and commits the result; CI regenerates it and fails on a
diff. Two things to know before you do the same:

- **Fields with a server-side default come out *required*.** `currency`,
  `source`, `default_split_weight` and `apply_split_rule` all have defaults, and
  `openapi-typescript` (with `--default-non-nullable`, which is on by default)
  marks them required in request bodies. The API accepts a body without them;
  the generated type does not. Send them explicitly rather than turning the flag
  off -- doing that would also make them optional in *responses*, where they are
  always present.
- **`openapi-fetch` needs an absolute `baseUrl`.** It builds a `new URL()`
  internally, and an empty base throws `Invalid URL` rather than falling back to
  a relative request.

### Retrying safely: `Idempotency-Key`

`POST /groups/{id}/expenses` and `POST /groups/{id}/settlements` accept an
optional **`Idempotency-Key`** header (any string up to 200 characters; a UUID
per user action is the obvious choice).

Send the same key when retrying a request whose reply never arrived, and you get
the original resource back rather than a second one. A phone on the underground
that sends rent, loses the reply and retries would otherwise pay rent twice.

- same key, same body -> **201** with the *first* request's resource
- same key, different body -> **409**. That is a client bug, and answering with
  the wrong resource would hide it
- a request that failed -> the key is released, so fixing a typo and sending
  again under the same key works

Keys are remembered per user and per endpoint, so two people picking `"1"` never
collide and nobody reaches someone else's resource by guessing.

Without the header nothing is deduplicated -- people really do buy the same
coffee twice.

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

`phone_number` is optional and must be an **Israeli mobile** — it is what Bit and
PayBox pay people on. Any usual spelling is accepted (`050-123 4567`,
`+972 50 123 4567`, `00972501234567`) and it is stored and returned as E.164,
`+972501234567`. A landline or anything else is a **422**; `""` means none.

```
AuthResponse = { access_token: string, token_type: "bearer", user: User }
User = { id, name, email, phone_number, created_at }
```

## Users

| Method | Path | Notes |
|---|---|---|
| GET | `/users/search?email=<fragment>` | Find people to add to a group. Fragment ≥ 3 chars. Returns `UserSearchResult[]`. |
| PATCH | `/users/me` | `{phone_number}` — set your number (same rules as at sign-up), or `null` / `""` to remove it. **Required**: leaving it out is a 422, so a client that forgot the field cannot wipe it. Returns `User`. |

```
UserSearchResult = { id, name, email }
```

**Who sees a phone number.** `User` carries it, and `User` is only ever returned
to that person or to someone who shares a group with them — who needs it to pay
them back (the settlement plan's `to_user.phone_number`). Search reaches every
account in the app, so it returns `UserSearchResult`, which has no phone number.

## Groups

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/groups` | — | Groups you're an active member of |
| POST | `/groups` | `{name, type, currency?}` | You become OWNER. `currency` defaults to `ILS` |
| GET | `/groups/{group_id}` | — | Includes `members` |
| PATCH | `/groups/{group_id}` | `{name?, currency?, address?}` | OWNER only. `address: ""` clears it |
| DELETE | `/groups/{group_id}` | — | OWNER only. 204. Cascades to expenses and settlements |

`type` is one of `SHARED_APARTMENT`, `COUPLE`, `SOLO`, `TRIP`.

```
Group = { id, name, type, currency, address, created_by, created_at, members: GroupMember[] }
```

`address` is the flat's street address as its bills print it (in Hebrew, for
Israeli bills). It is what tells a bill from Gmail which flat it belongs to
when someone lives in more than one; see Bills from Gmail.

```
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
  notes?, source?: "MANUAL"|"VOICE"|"OCR"|"GMAIL_API"|"RECURRING",
  apply_split_rule?: boolean,                           // default true
  items?: [{ name, amount, user_ids?: [uuid] }],        // split line by line, see below
  ai_metadata?: object                                  // what ingestion read, <= 16 KB
}
```

`source` is `RECURRING` when a schedule posted the expense rather than a person
(see Recurring bills).

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
  split_rule: SplitRuleSummary | null,
  created_by, created_at, updated_at,
  splits: [{ user: User, owed_amount, share_value }],
  items: [{ id, name, amount, users: [User] }]          // [] unless split by items
}
```

`receipt_url` is `null` until a receipt is uploaded, and otherwise the path to
fetch it (see below). `ai_metadata` is `null` for a hand-entered expense; a
scanned receipt stores what OCR read there, before anyone corrected it.

### Splitting line by line (`items`)

Send `items` instead of `participants` to split a receipt line by line. Send
`split_type: "EXACT"` with it; `participants` alongside `items` is a 422.

- Each line is split **equally among its `user_ids`**. An empty `user_ids`
  means everyone active in the group, and is stored with every name written
  out, so the line does not change meaning when someone joins later.
- Every line must be greater than zero. A discount is not a line: it is the
  gap between the lines and `total_amount`, and that gap -- a discount if
  negative, a service charge or tip if positive -- is spread **in proportion
  to what each person's lines came to**.
- The result is stored as an ordinary `EXACT` split. `splits` is still the
  answer to "who owes what"; `items` only explains it. Balances, settle-up and
  analytics never look at items.
- A PATCH that changes the split (amount, payer, split type or participants)
  **removes the items**, since they would no longer add up to it. A PATCH that
  touches only the title, date, category or notes keeps them.

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/groups/{group_id}/expenses/item-preview` | `{total_amount, items}` | Writes nothing |

```
ItemPreview = {
  splits: [{ user_id, owed_amount }],   // exactly what saving would store
  items_total, adjustment               // adjustment = total_amount - items_total
}
```

The preview is how a review screen shows exact per-person amounts while lines
are being assigned. It runs the same arithmetic as the save, so the two cannot
disagree -- and the client still never divides money.

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

### Scanning a receipt

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/groups/{group_id}/receipts/scan` | multipart `file` | Stores nothing. 503 without `ANTHROPIC_API_KEY` |

Reads a receipt photo with Claude and returns a **draft** for a person to
check. Same file rules as receipt upload (JPEG, PNG or WebP by their bytes, up
to 5 MB). 409 in a closed group; 400 if the photo is not a receipt or nothing
on it can be read.

```
ReceiptScan = {
  merchant, expense_date, total_amount, currency, category,   // any may be null but the total
  lines: [{ name, amount }],                                  // positive lines only
  warnings: ["NO_ITEMS"|"TOTAL_MISSING"|"DATE_MISSING"|"LINES_UNREADABLE"|"CURRENCY_MISMATCH"],
  ai_metadata: object                                         // send back on create
}
```

Warnings are codes, not sentences, so the client can say them in either
language. Discount lines on the receipt are not returned as lines; they are
already in `total_amount`, and show up as the gap between it and the lines.

To confirm a draft: `POST /groups/{id}/expenses` with `items`,
`split_type: "EXACT"`, `source: "OCR"` and the `ai_metadata`, then
`PUT /expenses/{id}/receipt` with the same photo. Two requests: the receipt
store names files after the expense, which does not exist until the first one
returns.

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

## Split rules

How a group has agreed to divide certain expenses, **automatically and from now
on**. A `WEIGHT` split already lets you type weights on one expense; a rule is
the same arithmetic agreed once.

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/groups/{group_id}/split-rules` | -- | Any member |
| POST | `/groups/{group_id}/split-rules` | `{name, category?, shares}` | 201. **Owner only** |
| PATCH | `/groups/{group_id}/split-rules/{rule_id}` | `{name?, shares?}` | Owner only |
| DELETE | `/groups/{group_id}/split-rules/{rule_id}` | -- | 204. Owner only |

```
SplitRule = {
  id, group_id, name, category,
  shares: [{ user: User, weight }],
  share_percent: { "<user id>": "38.9" },   // what the weights work out to
  created_by, created_at
}
```

Weights, not percentages: percentages are weights that have to add up to 100, so
supporting both would be two ways of saying one thing. **Square metres and
nights stayed are numbers people already have.**

- *Rent by room size* -- `category: "RENT"`, weights `14 / 12 / 10`
- *Nights stayed* -- no category, so it claims every expense on the trip

A group can hold **one rule per category plus one catch-all**. A named rule beats
the catch-all. An expense with no category can only match the catch-all --
guessing which named rule an uncategorised expense meant would be worse than
applying none.

**Whoever names participants wins.** A rule only fills the gap left by not
naming them, so an expense that says exactly who is on it is never quietly
re-split. Send `apply_split_rule: false` to force a plain split for one expense.

Two things that keep working when people move out:

- a rule whose members have partly left drops the departed shares and reweights
  the rest -- the remaining rooms are still the sizes they were
- a rule nobody is left in is ignored rather than fatal

Rules apply when an expense is **created**, not when it is edited: recategorising
an expense is a correction, not an instruction to redivide money already
recorded. Deleting a rule leaves every expense it split exactly as it was;
`Expense.split_rule` just becomes `null`.

`category` cannot be edited. Delete and recreate, so a change that alters what
every future expense costs is a deliberate act.

## Budgets

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/groups/{group_id}/budgets?month=YYYY-MM` | -- | Any member. Defaults to this month |
| POST | `/groups/{group_id}/budgets` | `{category?, amount}` | 201. **Owner only** |
| PATCH | `/groups/{group_id}/budgets/{budget_id}` | `{amount}` | Owner only |
| DELETE | `/groups/{group_id}/budgets/{budget_id}` | -- | 204. Owner only |

```
BudgetReport = { group_id, currency, month, budgets: BudgetStatus[] }
BudgetStatus = {
  budget: { id, group_id, category, amount, period, created_by, created_at },
  month, spent, remaining, share_used, level: "OK"|"WARNING"|"EXCEEDED"
}
```

One budget per category, plus an optional ceiling on the whole group
(`category` omitted). Spending is measured on **expense totals**, not on any one
person's share: a budget is a limit on what leaves the household.

A budget on `OTHER` also counts expenses nobody categorised, exactly as the
analytics endpoints fold them in.

`remaining` goes **negative** once the budget is blown, because "how far over are
we" is the number people want. Spending *exactly* the limit is `EXCEEDED`, not
`OK` -- the next coffee is over it. `WARNING` starts at 80%.

**Alerts fire once per budget per month per level**, as notifications to every
member, at the moment an expense trips them. Otherwise the twelfth expense over
the line raises a twelfth notification and everyone stops reading them. Changing
a budget clears its alert state, so raising one that was already blown can speak
up again.

## Recurring bills

Rent, electricity, water, the internet. A bill is a **template plus a schedule**;
when it falls due it becomes an ordinary expense with ordinary splits.

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/groups/{group_id}/recurring-bills` | -- | Soonest due first |
| POST | `/groups/{group_id}/recurring-bills` | `RecurringBillCreate` | 201. Any member |
| GET | `/groups/{group_id}/recurring-bills/{bill_id}` | -- | |
| PATCH | `/groups/{group_id}/recurring-bills/{bill_id}` | any subset | `active: false` pauses it |
| DELETE | `/groups/{group_id}/recurring-bills/{bill_id}` | -- | 204. Expenses already posted stay |
| POST | `/groups/{group_id}/recurring-bills/{bill_id}/generate` | `{amount?, expense_date?}` | 201, returns the `Expense` |
| POST | `/groups/{group_id}/recurring-bills/run` | -- | Post everything due, remind about the rest |

```
RecurringBillCreate = {
  title, frequency: "MONTHLY"|"EVERY_2_MONTHS"|"QUARTERLY"|"YEARLY",
  first_due_on, payer_id,
  amount?,                              // omit when the amount varies
  category?, split_type?, participants?, reminder_days_before?   // default 3
}
RecurringBill = { ...the above, plus:
  id, group_id, payer: User, next_due_on, anchor_day, active,
  last_generated_on, posts_itself, participants, created_by, created_at }
RunResult = { generated: Expense[], awaiting_amount: RecurringBill[], reminded: RecurringBill[] }
```

**`amount` is the distinction the whole feature turns on.**

- **Rent is 3600 every month.** The amount is known, so the bill posts itself.
- **Electricity is whatever the meter says.** No amount, so the bill *reminds*
  and never invents a number. Record it with `/generate` and an `amount`; without
  one that is a 400.

Leaving `participants` out means everyone active -- or whatever the group's
standing split rule says. That is how *rent, monthly* and *rent by room size*
combine into rent that posts itself on the right proportions.

`first_due_on` cannot be in the past: a schedule nobody has seen yet should not
conjure up months of back-dated expenses on its first run.

**Nothing runs on a scheduler.** Something has to call `run`: the app on load, or
`python run_due_bills.py` from cron. It is safe to call as often as you like --
a bill already posted for its due date has moved on, and a reminder already sent
is not sent again. A bill months overdue posts one expense per period it missed,
because each of those months really did have a rent payment in it.

Posting the same bill twice for one date is a **409**, enforced by a unique index
rather than a hopeful check. Expenses are attributed to whoever **set the bill
up**, not to whoever triggered the run.

Bills due on the 31st stay on the 31st: February clamps to the 28th and March
goes back to the 31st, rather than the bill walking backwards through the year.

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

`kind` is `EXPENSE_ADDED`, `COMMENT_ADDED`, `SETTLEMENT_RECORDED`,
`PAYMENT_REMINDER`, `BUDGET_WARNING`, `BUDGET_EXCEEDED` or `BILL_DUE`.

Who gets told what:

- **an expense** -- everyone on it, except whoever entered it
- **a comment** -- everyone on the expense, plus anyone already in the thread
- **a settlement** -- the other person
- **a reminder** -- the person who owes
- **a budget** -- every member, including whoever spent the money
- **a bill due** -- every member

Budget and bill notifications have **`actor: null`**. Nobody did those; a
threshold and a calendar did.

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

```
Settlement = {
  id, group_id, from_user: User, to_user: User, amount, method, note,
  settled_at, created_by, created_at
}
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

### Duplicate payments

`GET /groups/{group_id}/analytics/duplicates` -- pairs of expenses that look like
the same payment entered twice, likeliest first. Accepts `date_from`, `date_to`,
`window_days` (0-31, default 3) and `min_score` (0-1, default 0.60).

```
DuplicateReport = { group_id, currency, window_days, pairs: [{
  score, day_gap, same_payer, reasons: string[],
  first: { id, title, total_amount, expense_date, category, payer },
  second: { ...the same }
}] }
```

**Not the same question as anomalies.** `analytics/anomalies` asks whether *one*
expense is unlike its own history. This asks whether *two* expenses are the same
event, which needs money, timing and wording to agree at once.

The three things it is built to catch: two people paying the same bill, one
person tapping *Add* twice, and a bill recorded again under a slightly different
name. Every pair carries plain sentences saying why it was flagged, because a
confidence number on its own is not something anyone can act on.

The three-day window is what stops January rent being reported as a duplicate of
February rent. Widen it with `window_days` if you mean to.

**Suggestions only -- nothing is deleted or merged.** Two coffees at 12.00 on the
same day look exactly like a double tap and are not one. To stop duplicates being
recorded in the first place, use `Idempotency-Key`.

Dates narrow what is *reported*, never what is searched: a duplicate straddles
dates, so a pair is kept when either side falls in range.

### Ask a question (natural language)

`POST /groups/{group_id}/analytics/ask` with `{"question": "...", "language": "en" | "he"}`
(question 3-500 chars; `language` defaults to `"en"`, anything else is 422).

```
AskResponse = { question, sql, explanation, columns, column_labels, rows, row_count, truncated }
```

**`language` is the app's language, not the question's.** Send the locale the
screen is shown in: `explanation` and `column_labels` come back in it, so a
Hebrew question typed in the English app still gets an English answer.
`column_labels` maps a column name to a short heading (`{"total_paid": "Total
paid"}`); it may miss a column, so fall back to the column name. The column
names themselves stay snake_case English in both languages.

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

## Bills from Gmail

Reads utility bills from the signed-in user's Gmail (read-only), and splits
them. Setup, including the Google Cloud side: `docs/gmail-setup.md`. Without a
Google client or `TOKEN_ENCRYPTION_KEY`, the endpoints below return 503 and
`GET /integrations/gmail` says `available: false`.

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/integrations/gmail` | -- | `GmailStatus` |
| POST | `/integrations/gmail/connect` | -- | `{authorization_url}`. Send the browser there |
| DELETE | `/integrations/gmail` | -- | 204. Revokes at Google; imported bills stay |
| POST | `/integrations/gmail/sync` | -- | `GmailSync`. Safe to repeat: each email is read once |
| GET | `/bills` | Query: `status` (default `PENDING_REVIEW`), `limit`, `offset` | `Page<IngestedBill>`, the caller's own |
| POST | `/bills/{bill_id}/approve` | `{group_id, total_amount?}` | `Expense`. 409 if already dealt with |
| POST | `/bills/{bill_id}/dismiss` | -- | `IngestedBill` |

```
GmailStatus = { available, connected, google_email?, connected_at?, last_synced_at?, needs_reconnect }
GmailSync   = { checked, imported, needs_review, skipped, needs_reconnect }
IngestedBill = {
  id, status: "IMPORTED"|"PENDING_REVIEW"|"APPROVED"|"DISMISSED"|"SKIPPED",
  review_reason: "NOT_A_BILL"|"UNREADABLE"|"NO_AMOUNT"|"NO_FLAT"|"AMBIGUOUS_FLAT"
               |"UNKNOWN_SENDER"|"RECURRING_CONFLICT"|"CURRENCY_MISMATCH"|"DUPLICATE" | null,
  sender, subject, received_at, provider_name, total_amount, currency, due_date,
  billed_to_name, service_address, invoice_number, category,
  group: {id, name, currency} | null,   // where it went, or the suggestion
  address_score, expense_id, created_at
}
```

**Connecting.** `connect` returns Google's consent address rather than
redirecting, because a redirect cannot carry the `Authorization` header. The
`state` in it is a signed, ten-minute token for this purpose only -- it cannot
be used to sign in. Google sends the browser to
`/integrations/gmail/callback`, which always ends on
`{FRONTEND_URL}/settings?gmail=connected|denied|failed`. The refresh token is
stored encrypted and never returned.

**What happens to each email.** It becomes an ordinary expense -- split among
the flat's active members at their `default_split_weight`, paid by the mailbox
owner, `source: GMAIL_API`, `category` from the bill or `UTILITIES` -- only when:

1. the amount was read;
2. the mailbox owner has an open `SHARED_APARTMENT` group (trips, couples and
   solo groups are never candidates);
3. with more than one, the bill's service address clearly matches one flat's
   `address` (house numbers must match exactly);
4. the sender's domain is a known utility (`BILL_TRUSTED_SENDER_DOMAINS`);
5. that flat has no fixed-amount recurring bill of the same category (it would
   be charged twice);
6. the currency matches the flat's.

Anything else waits in `GET /bills` with its `review_reason` and, when there is
one, a suggested `group`. Nothing waiting is in any balance, total or chart --
pending bills are not expenses. An email that is not a bill is `SKIPPED` and
none of its content is kept. The same provider and invoice number already split
in that flat -- from a flatmate's mailbox, say -- is `SKIPPED` as `DUPLICATE`.

**Approving.** `group_id` must be an open group the caller is active in.
`total_amount` is required when the amount could not be read, and otherwise
replaces what was read.

## The money assistant (chat)

A conversation with Claude about one group's money. **Private:** each
conversation belongs to the person who started it, and nobody else -- not even
the group's owner -- can see that it exists.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/groups/{id}/chat/conversations?limit&offset` | | `Page[ConversationOut]`, yours only, most recent first |
| POST | `/groups/{id}/chat/conversations` | `{message, language}` | **201** `ConversationDetailOut` |
| GET | `/chat/conversations/{id}` | | `ConversationDetailOut` |
| POST | `/chat/conversations/{id}/messages` | `{message, language}` | `ConversationDetailOut`, the new answer last |
| DELETE | `/chat/conversations/{id}` | | 204 |

```
ConversationOut       = { id, group_id, title, created_at, last_message_at }
ConversationDetailOut = ConversationOut + { messages: ChatMessageOut[] }   // oldest first
ChatMessageOut        = { id, role: "USER" | "ASSISTANT", content, tools_used, created_at }
tools_used            = [{ name, input }]   // on an answer: what it looked at
```

- `message` is 1-2000 characters; `language` is `"en"` or `"he"` (the app's
  language -- the answer comes back in it), default `"en"`.
- **The first question creates the conversation.** There is no empty
  conversation; its `title` is that question, shortened to 60 characters.
- **Nothing is saved unless an answer comes back.** On **503** (no key, the
  model busy, or it could not finish) the question is not stored -- keep the
  text so the person can send it again.
- Someone else's conversation is **404**. Your own, after you have left its
  group, is **403**.
- `content` is plain text, with lists as lines starting `- `. Render it with
  line breaks kept (`white-space: pre-line`) and `dir="auto"`.
- `tools_used[].name` is one of `spending_summary`, `spending_by_category`,
  `spending_by_month`, `spending_by_member`, `balances`, `unusual_expenses`,
  `possible_duplicates`, `list_expenses`, `query_database`. Name an unknown one
  generically: the list will grow.
- **The assistant cannot change anything.** Every tool reads; asked to add an
  expense or record a payment, it says where in the app to do it.

## Not built yet (Step 3+)

Do not build UI against these; they don't exist:

- Voice entry
- Splitting one line by quantity or by uneven shares (a line is split equally
  among the people on it)
- Bit / PayBox deep links

## Demo data

`python seed.py` (from `backend/`) creates the flat "Dizengoff 5" with
`gal@`, `maya@` and `noa@studentwise.dev`, password `password123`, eighteen
expenses covering every split type (including six months of electricity and
water so the anomaly endpoint has history), one Bit settlement, a two-message
comment thread, and the notifications all of that raised.
