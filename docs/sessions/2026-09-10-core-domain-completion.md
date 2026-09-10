# 2026-09-10 — Finishing Epic 2, and two things GitHub would not let us do

Missions attempted: **0.5, 0.6, 0.7, 2.9, 2.10, 2.11, 2.12, 2.13**.
Six landed. Two are blocked on GitHub's pricing, not on the code.

Result: **44 endpoints · 8 tables · 437 tests · 5 migrations**, all green.
Epic 2 (Splitwise parity) is complete.

---

## What was built

### 2.9 — Pagination metadata

Every list endpoint that can grow now returns
`{items, total, limit, offset, has_more}` instead of a bare array:
`/groups/{id}/expenses`, `/groups/{id}/settlements`, plus everything new below.

`total` is the count **after filters, before limit/offset**, which is what a
pager actually needs. The page and the count are built from the *same* filter
helper (`_filters()` in `expense_repository`) on purpose — a total assembled
from a different set of filters than the page is worse than no total at all,
because it looks authoritative and is wrong.

This is a breaking change to the contract. Doing it now, with no frontend, cost
four lines of test changes; doing it in a month would have cost a UI rewrite.

### 2.10 — Cross-group activity feed

`GET /activity` and `GET /groups/{id}/activity`. Expenses and settlements merged,
newest first, each item carrying the whole row so a home screen can render *and*
open a row without a second request.

Merged in Python rather than with a SQL `UNION`. The two shapes differ enough
that a union would flatten both to a lowest common denominator and then re-fetch
the rows anyway, and the cost is bounded: each side fetches exactly
`offset + limit` rows, so a page costs the same in a group with ten thousand
expenses as in one with ten. If deep paging ever becomes real the answer is a
keyset cursor on `created_at`, not a union — noted in the module docstring.

Ordered by `created_at`, never `expense_date` or `settled_at`: those are
user-supplied and can be backdated, and a bill entered today for last month
belongs at the top of the feed.

### 2.11 — Receipt upload and storage

`PUT`/`GET`/`DELETE /expenses/{id}/receipt`. JPEG, PNG or WebP up to 5 MB, on
local disk behind a small interface (`core/storage.py`) whose only external
contract is an opaque key — so **mission 5.3 is done too**, and moving to object
storage later is a deployment task that touches nothing which reads a receipt.

Three decisions that are the whole point of the mission:

- **The format is decided by sniffing the bytes**, not by the `Content-Type` the
  client sent. A browser — or an attacker — can put anything in that header.
- **Keys are generated from the expense UUID and re-checked against a pattern**
  before becoming a path. Nothing a user typed reaches the filesystem: no
  original filename, no declared type.
- **The image is served by an authorized endpoint, not a static directory.**
  A receipt shows what someone bought and where they were.

`PUT`, not `POST`, because an expense has exactly one receipt: uploading twice
leaves the same state and no orphan file.

### 2.12 — Comments on an expense

A thread per expense, oldest-first (a conversation reads that way; a feed does
not). Any group member can comment, including someone not on the expense —
"why am I not on this?" is exactly the comment worth allowing.

Editing is author-only and **stamped** (`edited_at`). Re-sending identical text
is not an edit. An unmarked edit would let someone rewrite what they agreed to
after the fact, which defeats the point of having the thread. Deleting is the
author or a group owner, because somebody has to be able to remove abuse.

### 2.13 — Notifications and reminders

`notifications` fans out on write: one row per recipient, created inside the
originating service's transaction. An expense shared by four people writes three
notification rows. That costs a handful of small inserts and makes the read path
— hit on nearly every screen — a single indexed lookup by user.

**No wording is stored.** A row carries `kind` plus a `payload` of plain facts,
and `render()` turns that into a title and body at read time. A Hebrew version is
another branch in one function and needs no migration. The API returns the
rendered text *and* the payload, so a client can write its own wording.

Reminders (`POST /groups/{id}/reminders`) are deliberately narrow: you can only
remind someone who owes **you**, and the amount comes from the settlement plan
rather than the request body. A reminder anyone could send to anyone for any
amount is a harassment feature, not a payments feature.

### 0.7 — Onboarding

`docs/onboarding.md`: install list with the reason for each pin, first run,
**five checks in `/docs` that prove the environment**, a map of the code, each
teammate's first mission, and the git flow. Linked from the README.

---

## What surprised us

### `now()` is the transaction's start time

The first comment-thread test failed: three comments came back in the order
`Third, First, Second`. All three had *identical* `created_at`, because Postgres
`now()` returns the transaction's start time and the test harness runs each test
in one transaction.

The tempting fix is to change the test. The real problem is the default. In
production each request is its own transaction so the bug hides — but it comes
straight back the moment one action writes several rows, which is exactly what
**Epic 5 does**: one receipt becomes several expenses in one transaction, and
they would all have landed in the feed in arbitrary order.

So `created_at` now defaults to `clock_timestamp()` on `expenses`, `settlements`,
`groups`, `expense_comments` and `notifications` — it reads the real clock on
each insert. Migration `b0ff954ca818` alters the three existing tables; existing
rows keep the timestamps they have.

Every ordered query also gained an `id` tiebreak, so a pager cannot repeat or
skip a row across a page boundary even on a genuine tie.

### The receipt tests all passed first run

Which is the same signal that hid two real holes in the SQL guard last session.
So the store was attacked directly in `tests/unit/test_storage.py`, round the
back of the API: traversal keys, uppercase UUIDs, `.php` extensions, GIF and SVG
and PHP and a Windows executable, a RIFF container that is actually audio.

Nothing got through — but it did turn up a gap in the *response*, not the store.
A file can be a valid PNG **and** valid HTML. The store accepts it (correctly:
it is a real PNG), so the served response now carries
`X-Content-Type-Options: nosniff` to stop a browser deciding for itself that it
is a document. That header was missing before the probe.

### `alembic check` does not compare server defaults

Autogenerate ignores `server_default` changes unless explicitly configured to
compare them, so the three `ALTER COLUMN ... SET DEFAULT` statements are written
by hand in the migration, with a note saying why. The enum CHECK constraint on
`notifications.kind` *was* emitted correctly this time — verified against
`pg_constraint` rather than assumed, after last session's lesson.

---

## What could not be done, and why

### 0.5 — Adding Hila and Dana 🚫

The emails are `hila18@gmail.com` / `hilazu@post.bgu.ac.il` (Hila) and
`danabern@post.bgu.ac.il` (Dana). **GitHub's REST API only accepts a username**
for repository collaborators, and `PUT .../collaborators/hila18%40gmail.com`
returns 404. Searching for the addresses returns nothing, because GitHub only
indexes emails users have made public.

The **web UI does accept an email**:
<https://github.com/galharel23/StudentWise/settings/access> → Add people → paste
the address. Two minutes, and it is the highest-value two minutes in the whole
roadmap — nothing else in Week 1 matters while two of three people cannot see
the code.

### 0.6 — Protecting `main` 🚫

Both routes refused, identically:

```
gh api -X PUT  repos/.../branches/main/protection  → 403 Upgrade to GitHub Pro
gh api -X POST repos/.../rulesets                  → 403 Upgrade to GitHub Pro
```

Branch protection and rulesets are both paid on a **private** repo. The rule we
want is written and committed as `.github/ruleset-main.json` (PR required,
1 approving review, stale approvals dismissed, threads resolved, squash-only,
CI check `backend` green, no force push, admins may bypass), so turning it on is
one command once the plan allows it. `.github/branch-protection.md` has the three
ways out; the best is the **GitHub Student Developer Pack** — free Pro, and both
`.ac.il` addresses qualify.

`CLAUDE.md` used to claim `main` was protected. It now says protected *by
convention* and points at that file, because a rulebook that describes a rule
nobody enforces is worse than one that admits it.

---

## Next

1. **0.5 in the browser.** Everything else waits behind it.
2. **9.1–9.3** (Dana) and **5.1–5.2** (Hila) — both unblocked, no backend work
   needed first.
3. **10.1** — ask the lecturer about hosting. One question, gates all of Epic 10.

Two smaller things noticed and deliberately not done:

- The Text-to-SQL guard's `ALLOWED_RELATIONS` does **not** include
  `expense_comments` or `notifications`, so "what did we say about the
  electricity bill?" cannot be answered. Adding comments would need its own
  scoping CTE and is Epic 8 territory — worth a deliberate decision, not a
  silent one.
- Receipt files are deleted when an expense is deleted, but nothing sweeps files
  left behind by a crash between the commit and the unlink. At this scale that is
  a stray file, not a bug worth a reaper.
