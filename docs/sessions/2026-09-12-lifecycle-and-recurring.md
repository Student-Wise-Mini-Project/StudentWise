# Four gaps, closed

**Date:** 2026-09-12
**Branches:** `feat/close-groups` → `feat/group-picker` → `feat/member-suggestions`
→ `feat/recurring-ui` (stacked), then `feat/bill-occurrences` off `main`.
All merged to `main` as fast-forwards.
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

**Rebasing the stack silently dropped two commits.** Moving a late fix down to
`feat/close-groups` and replaying the stack, `git rebase --onto <new-base>
<bad-upstream> feat/group-picker` reported *"Successfully rebased"* and left
`feat/group-picker` byte-identical to its base — both picker commits gone. The
originals were still reachable, so the stack was rebuilt by cherry-picking and
each branch's ancestry checked with `git merge-base --is-ancestor`. Worth
recording because **nothing failed at the time**: the rebase claimed success,
and only a later `tsc` error (`Cannot find module '@/features/groups/
GroupPickerSheet'`) revealed it. Check `git rev-list --count` per branch after
any `--onto`.

**Three test failures in a row were the tests being wrong, not the code.**
"Rent" matched both a row and a category `<option>`; "Closed" appeared as both a
section heading and a badge; `3600` came back as `3600.00` because `MoneyInput`
normalises. Worth noting because each one looked like a bug for about a minute.

## Verification

- Backend: **600 passed**, `ruff check` clean, `alembic check` reports no new
  upgrade operations.
- Frontend: **253 passed** across 33 files — including all three guards
  (design tokens, logical properties, no bare strings) — `eslint` clean,
  `tsc -b` clean, `npm run build` clean.
- Stack ancestry checked with `git merge-base --is-ancestor`: 9 ⊂ 11 ⊂ 13 ⊂ 19
  commits, then all fast-forwarded onto `main`, plus 2 for 6.5.
- No catalogue key added this session is unrendered (scanned; three were, and
  were either wired up or deleted).
- `schema.d.ts` regenerated from `app.main`: 111 lines, additions only.
- `node scripts/check-roadmap-sync.mjs`: in sync, 85 missions, 54 done.

## A fifth thing, asked for after the other four landed

**6.5 — a recurring bill can run a set number of times.** "Twelve months of
rent" is a real agreement, and until now every schedule ran forever: the only
way to end one was to remember to delete it.

`occurrences_total` is NULL for forever, so every existing bill is unchanged.
`occurrences_done` is counted in `_post_one` — the single place an occurrence
happens — and *after* the IntegrityError guard, so losing the race for one due
date does not burn one of the twelve. It counts **postings, not surviving
expenses**: deleting one of the twelve rents corrects that expense, it does not
buy a thirteenth. Counting live rows instead would have silently extended the
schedule every time somebody tidied up, and rule 5 makes expense deletion
permanent.

`is_finished` is derived and deliberately **not** folded into `active`. Pausing
is something a person did and can undo; finishing is arithmetic. One flag for
both would mean Resume on a spent bill quietly posts a thirteenth rent.

Three things that needed care:

- **The catch-up loop re-checks the limit every turn**, not once. It posts one
  expense per period missed, so a bill five months overdue with two left must
  stop at two. It was the one place the count could have been walked straight
  past.
- **The migration backfills `occurrences_done`** from the expenses each bill
  already posted. Starting at zero would have handed extra months to exactly
  the bills running longest.
- **Autogenerate does not emit `CheckConstraint`.** The model grew
  `occurrences_total > 0` and the generated migration said nothing about it —
  the same trap `453f7823ac5b` records hitting with the VARCHAR enum
  constraints. Written out by hand.

One process note: the editor field got written before its test. Rather than let
the test pass vacuously, the wiring was temporarily broken, the test watched to
fail for the right reason, and then restored — so it is proven to catch a
regression rather than merely to agree with the code.

## Caught on a second pass, after claiming it was finished

Re-reading the spec rather than the diff turned up three things, all now fixed:

- **Reopen belonged in the Closed list section**, not only in the danger zone
  inside the group. Reopening is the answer to "I closed the wrong one", and
  that is realised while looking at the list.
- **`awaiting_amount` had nowhere to land after all.** A varying bill past its
  due date rendered identically to one due next month. Overdue bills now read
  **Due now**; the commit message had claimed this before it was true.
- **Three keys were written and never rendered** (`recurring.variesNote`,
  `groups.danger.reopenTitle`/`reopenBody`, `expenses.repeats.hint`). Two were
  deleted; the third said something genuinely non-obvious — that the schedule
  starts *next* period — so it is now shown under the Repeats row.

The lesson is cheap and repeatable: a passing suite says the code does what the
tests say, not what the spec says. The gaps were all in places no test was
looking, and a key that is never rendered is invisible to every guard we have.

## Not done / next

- **These went to `main` directly, not through PRs.** Asked for explicitly, and
  worth recording rather than leaving to be discovered: the CLAUDE.md rule is
  PR plus one teammate's approval, and five branches bypassed it. Every merge
  was a fast-forward, so the history is linear and every commit message
  survives.
- **The danger zone is in the wrong place** and the code says so. "Members" is
  not where anyone looks for "close this group". It is there because there is no
  menu component and a new route for two buttons is worse. It moves in an
  afternoon.
- **PERCENTAGE / EXACT splits on a recurring bill**, if anyone actually wants
  them. Needs a `SplitEditor` that can work without a total.
- Epic 9 still has 9.9 (Ask screen, needs a key), 9.10 (anomaly alerts) and
  9.12 (APK).
