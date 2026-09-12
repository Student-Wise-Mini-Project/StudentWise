# Four gaps, closed

**Date:** 2026-09-12
**Branches:** `feat/close-groups` → `feat/group-picker` → `feat/member-suggestions`
→ `feat/recurring-ui` (stacked, see *Not done* below)
**Spec:** `docs/superpowers/specs/2026-09-12-lifecycle-and-recurring-design.md`
**Plan:** `docs/superpowers/plans/2026-09-12-lifecycle-and-recurring.md`

---

## What prompted it

Four things reported from *using* the app, not from reading it:

1. The add button "still just leads to the groups page".
2. No way to add a **הוצאה חוזרת** — a bill that comes round every month.
3. No way to delete or close a group when a trip is over and everyone has settled.
4. Creating a group cannot suggest anybody; you type emails one at a time.

The finding underneath them is the one worth keeping: **the backend was further
ahead than the frontend, and three of the four were a screen that was never
built rather than a decision that was never made.** Epic 6 (recurring bills) had
been marked complete for two days — CRUD, pause, generate-now, reminders, the
lot — with no way to reach any of it from the UI. Only #3 needed a migration;
#4 needed no backend work at all.

## What was built

**2.14 / 9.14 — closing a group.** `groups.archived_at`, `POST /close`,
`POST /reopen`, and one business rule: `group_service.require_open`. The group
list gained a *Closed* section, and close/delete live in a danger zone on the
Members tab.

**9.15 — the `+` bar.** Outside a group it now opens a picker rather than the
groups list. One open group skips the picker; none still falls back to the list.

**9.16 — member suggestions.** Chips of the people you already share a group
with, in the create-group sheet and in Add member.

**9.17 — recurring bills.** A fifth group tab: the schedules, an editor, pause
and resume, delete, and "Post now" for the ones whose amount varies. Plus a
**Repeats** row in the expense form, so ticking it while adding this month's
rent sets the schedule up behind you.

## Decisions, and why

### A closed group takes no new spending, but debts can still be paid

Closing is deliberately allowed while money is outstanding. Real trips end with
somebody paying in cash, and a group that cannot be closed until the app agrees
it is square is a group nobody can ever close. The client warns and names what
is owed — "Maya owes Gal ₪120" — and the decision stays with the person.

That choice has a price, and it is the load-bearing part of the design:
**settlements must keep working on a closed group**, or the ₪120 it closed owing
could never be paid off and the warning is a trap. `settlement_service` carries
a comment saying so, because the omission otherwise looks like an oversight
somebody will helpfully "fix".

So it is an allowlist, not a read-only flag. Blocked: expenses, receipts, new
members, recurring bill create/update/generate, budgets, split rules. Open:
recording a settlement, every read, leaving, reopen, delete.

### `require_open` is an explicit call, not a dependency

`PATCH /expenses/{id}` and its siblings resolve through `ExpenseForMember`, not
`GroupMembership`, so no single FastAPI dependency reaches every write. An
explicit call is also greppable: "what does closing actually block?" is one
`rg require_open` away. `tests/api/test_groups_close.py` enumerates the write
endpoints against a closed group so a future one that forgets the call fails
loudly.

### `run` returns empty on a closed group rather than raising

The client calls `POST .../recurring-bills/run` on *every* group open. A 409
there would make a closed group impossible to look at. A closed group simply has
nothing due.

### Member suggestions are a derivation, not an endpoint

`useGroups()` already caches every group with its full member list, so "people
you share a group with" is a `useMemo`, not a request. A `GET /users/suggestions`
could rank better one day — shared expense recency rather than shared group
count — and that is the day to build it.

### The repeats toggle fires two requests, and says so when the second fails

`first_due_on` is **one period after** the expense's date, never on it: the
expense being added is this period's, so a schedule due the same day would have
tonight's `run` post it twice, and the unique index behind that would turn the
next group open into a 409. `onePeriodAfter` clamps into short months the way
the backend's `clamp_to_month` does.

The atomically-correct answer is a `recurring` block on `ExpenseCreate`. It was
rejected: it would make `expense_service` call `recurring_bill_service`, and the
domain notes deliberately point that arrow the other way. What the
non-atomicity is not allowed to be is *silent* — if the bill fails the expense
stands, the screen says so, and the retry re-sends only the bill. A bill that
quietly never recurs is found out the month it was needed.

### Scoped out of v1: PERCENTAGE and EXACT splits on a bill

`SplitEditor` is built around a known total and a varying bill has none. The
editor offers EQUAL and WEIGHT, and omits `participants` entirely so the API
falls back to every active member — or to a standing split rule for the
category. That is how "rent, monthly" and "rent by room size" combine without
the sheet knowing about either.

## What surprised us

**The generated types made a real bug impossible to ship.** Pausing a bill
sends `{active: false}`, and `clear_amount` is required in the generated
`RecurringBillUpdate` because it has a server-side default. `tsc` refused it.
Had it been optional, pausing the rent would have silently wiped its amount and
turned a self-posting bill into a reminder. The `--default-non-nullable` trade
the frontend made months ago paid for itself here.

**`archived_at` is optional, not just nullable.** The first four call sites all
wrote `archived_at === null`, which reads a *missing* field as closed — so a
group from any payload that omits it would have been silently locked. One shared
`isGroupOpen` predicate now answers it in one place, because the group list, the
`+` bar and the group scope have to agree or a group is closed in one screen and
open in another.

**A `useEffect` that synced form fields to props was a lint error, and the lint
was right.** React 19's `react-hooks/set-state-in-effect` caught it. The fix —
mount the editor only while open and key it by bill — is shorter than the effect
was, and "fresh state for a different bill" is something React gives you for
free as a remount.

**Three test failures in a row were the tests being wrong, not the code.**
"Rent" matched both a row and a category `<option>`; "Closed" appeared as both a
section heading and a badge; `3600` came back as `3600.00` because `MoneyInput`
normalises. Worth noting because each one looked like a bug for about a minute.

## Verification

- Backend: **591 passed**, `ruff check` clean.
- Frontend: **244 passed** across 33 files — including all three guards
  (design tokens, logical properties, no bare strings) — `eslint` clean,
  `tsc -b` clean, `npm run build` clean.
- `schema.d.ts` regenerated from `app.main`: 111 lines, additions only.
- `node scripts/check-roadmap-sync.mjs`: in sync, 84 missions, 53 done.

## Not done / next

- **The four branches are stacked, not merged.** `main` is protected by
  convention and each branch needs a teammate's approval, so `feat/group-picker`
  sits on `feat/close-groups`, and so on. They must be merged **in order**.
  Rebase-merging rewrites the SHA, so after each merge the next branch needs
  `git rebase --onto origin/main <old base sha>`; and per CLAUDE.md, do not
  delete a base branch while the next PR is still stacked on it.
- **The danger zone is in the wrong place** and the code says so. "Members" is
  not where anyone looks for "close this group". It is there because there is no
  menu component and a new route for two buttons is worse. It moves in an
  afternoon.
- **PERCENTAGE / EXACT splits on a recurring bill**, if anyone actually wants
  them. Needs a `SplitEditor` that can work without a total.
- Epic 9 still has 9.9 (Ask screen, needs a key), 9.10 (anomaly alerts) and
  9.12 (APK).
