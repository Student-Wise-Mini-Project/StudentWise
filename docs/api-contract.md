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
  category?, notes?, source?: "MANUAL"|"VOICE"|"OCR"|"GMAIL_API"
}
```

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
  split_type, source, notes, receipt_image_url, ai_metadata,
  created_by, created_at, updated_at,
  splits: [{ user: User, owed_amount, share_value }]
}
```

`receipt_image_url` and `ai_metadata` are always `null` for now; the Step 3 AI
ingestion modules will populate them.

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

## Not built yet (Step 2+)

Do not build UI against these; they don't exist:

- `GET /groups/{id}/balances` — who owes what, net
- `POST /groups/{id}/settle` — min-cash-flow suggestions, and Bit/PayBox deep links
- Receipt OCR, voice entry, Gmail scraping, per-item splitting
- Analytics, charts, anomaly detection, natural-language querying

## Demo data

`python seed.py` (from `backend/`) creates the flat "Dizengoff 5" with
`gal@`, `maya@` and `noa@studentwise.dev`, password `password123`, six expenses
covering every split type, and one Bit settlement.
