# Four gaps: the add button, recurring bills, closing a group, and who to add

**Date:** 2026-09-12
**Branches:** four, off `main` — `feat/group-picker`, `feat/member-suggestions`,
`feat/close-groups`, `feat/recurring-ui`
**Status:** design approved, plan pending

---

## Why now

Four things were reported from using the app, not from reading the code. They
are unrelated to each other, which is itself the finding: the backend is further
ahead than the frontend, and three of the four are a screen that was never
built rather than a decision that was never made.

| # | Reported | What is actually missing |
|---|---|---|
| 1 | "the add balance button still just leads to the groups page" | The `+` bar's fallback outside a group. The bar reads the screen it is on (`9a2181a`); outside a group there is nothing to read. |
| 2 | "no option to add הוצאה חוזרת" | The whole recurring-bills UI. The backend has had full CRUD since epic 6. |
| 3 | "no option to delete or close groups" | A "closed" concept, and any UI at all. `DELETE /groups/{id}` exists and `useDeleteGroup` exists; nothing calls it. |
| 4 | "suggest members from other groups" | A member step in group creation. Creation takes a name and a type and nothing else. |

Only #3 needs a migration. #4 needs no backend work at all.

---

## Decisions

### 1. The `+` bar opens a picker, not the groups list

`AppShell` computes `addExpenseTo = groupId ? '.../expenses/new' : '/groups'`.
Inside a group that is right. Outside one it hands the user a list of groups and
no indication that they were halfway through adding an expense — the intent is
dropped on the floor and has to be re-formed on the next screen.

Outside a group the bar becomes a `<button>` that opens a `GroupPickerSheet`;
inside a group it stays a `<Link>` and is untouched. Picking a group navigates
to that group's expense form, so the intent survives the detour.

Three behaviours that matter more than the sheet itself:

- **One open group → no sheet.** Navigate straight to its form. Most people are
  in one main group and should not pay a tap to confirm it.
- **Zero groups → keep going to `/groups`.** The empty state there already says
  what to do; a picker with nothing in it would not.
- **Rows carry your net in that group**, not just the name. "Which group?" is
  easier to answer next to "₪120 / ₪0 / -₪40" than against a list of nouns.

Ordering is last-opened first, then by name. Last-opened is recorded in
`lib/prefs.ts` under `sw.lastGroup`, set from `GroupScopeRoute`. Per-device,
alongside theme and locale, for the reason that file already gives: it is a
property of the phone, not of the account.

**Rejected: a group dropdown inside the expense form.** Fewer taps, but the
editor derives members, currency and the whole split from `useGroupScope()`, and
changing the group mid-form would have to re-derive all three and discard a
part-built split. The picker keeps that coupling intact.

**Rejected: jump to the last-used group with no picker.** Fastest for the common
case and silently wrong otherwise — and "silently wrong" in a money app means an
expense filed against the wrong people.

### 2. Recurring bills: the toggle creates, the tab manages

The backend distinction the feature turns on is already built and is the thing
the UI has to carry: `posts_itself` is true when the amount is known. **Rent
posts itself; electricity waits for somebody to read the meter.** A UI that
treats those as one thing is a UI that invents an electricity bill.

**The tab.** A fifth group tab, `groups/:groupId/recurring` → `RecurringScreen`.
Five tabs do not fit a 360px phone, so the tab nav in `GroupLayout` gains
horizontal overflow scroll.

Rows sort soonest-due, showing title · frequency · next due, and either the
amount or the word **varies**. Actions per row: **Post now** (a varying bill
opens an amount sheet first), **Pause/Resume** (`active`), Edit, Delete.

`RunResultOut.awaiting_amount` — bills that came due with no amount — finally
has somewhere to land. Until this screen exists those bills are due, invisible,
and waiting on a person who is never told.

**The toggle.** In the expense form, create mode only, a row under the date:
*Repeats* → off / monthly / every 2 months / quarterly / yearly.

On save it issues two requests: create the expense, then create the bill with
`first_due_on` set **one period after this expense's date**. Not the expense's
own date — `run` would then post the same bill again the same day, and the
unique index would turn that into a 409 on the next group open.

This is not atomic. If the second request fails the expense stands and the user
is told: *"Expense saved, but the repeat wasn't set up"*, with a retry. A silent
half-success is the worse failure — the bill silently never recurs and nobody
finds out until the month it was needed.

**Rejected: a `recurring` block on `ExpenseCreate`** so the server does both in
one transaction. It is the atomically-correct answer, and it is backend surface
added for a client convenience: `expense_service` would have to call
`recurring_bill_service`, and the domain notes deliberately point that arrow the
other way — recurring bills call `build_expense`, not the reverse. Worth
revisiting if the two-request failure turns out to happen to real people.

**Scoped out of v1: `PERCENT` and `EXACT` splits on a bill.** `SplitEditor` is
built around a known total and a varying bill has none. v1 offers `EQUAL` and
`WEIGHT`, which need no per-person amounts, over all active members — which is
also what the API does when `participants` is omitted, so a standing split rule
for the category still decides. That is how "rent, monthly" and "rent by room
size" combine, and it costs nothing to leave in place.

### 3. Closing a group is not deleting it, and both exist

A trip that ends is not a mistake to be erased. Closing and deleting answer two
different questions and get two different buttons.

**Schema.** `groups.archived_at TIMESTAMPTZ NULL`, migration in the same commit
as the model. `GroupOut.archived_at` follows, and the frontend types are
regenerated.

**Routes.** `POST /groups/{id}/close` and `POST /groups/{id}/reopen`, owner-only.
Dedicated verbs rather than a flag on `PATCH`: closing a group should not be
something a rename can do by accident, and the verb is what the notification and
the audit story will want later.

**Enforcement.** One rule in one place — `group_service.require_open(group)`,
raising `ConflictError("This group is closed")` — called at the top of each
write service.

A dependency would be tidier but cannot reach: `PATCH /expenses/{id}` and
`DELETE /expenses/{id}` resolve through `ExpenseForMember`, not
`GroupMembership`, so no single dependency covers every write. An explicit call
is also greppable, which the dependency version is not.

**What closing actually blocks.** This is the part that matters, and it follows
from the choice to warn-but-allow on an unsettled group:

| Blocked when closed | Still allowed |
|---|---|
| Expense create / update / delete | **Recording a settlement** |
| Receipt upload / delete | Reading everything |
| Recurring bill create / update / generate | Leaving the group |
| Add member | Reopen |
| Budgets, split rules | Delete |

**A closed group takes no new spending, but debts can still be paid off.**
Settlements must stay open or the warning becomes a trap: a group may close
owing ₪120, and that ₪120 has to be payable afterwards.

**One trap.** `recurring_bill_service.run` is called by the client on *every*
group open. On a closed group it returns an empty result and **does not raise**,
or opening a closed group 409s on arrival.

A test in `tests/api/test_groups_close.py` enumerates every write endpoint
against a closed group, so an endpoint added later that forgets `require_open`
fails loudly rather than quietly accepting writes into a closed trip.

**Frontend.** Open groups list as they do now; a muted **Closed** section below,
with Reopen for owners. A closed group hides the `+` bar and the
Add-expense/Add-member actions and carries a banner saying why. Balances and
Record-a-payment stay live.

Close and Delete live in a **danger zone at the bottom of the Members tab**,
owner-only. This is the weakest part of the design: "Members" is not where
anyone would look for "close this group". The alternative is an AppBar overflow
menu, and there is no menu component — a new primitive or a new route for two
buttons. Taking the cheaper option knowingly, and it moves in an afternoon.

Closing confirms against the settlement plan and names what is outstanding:
*"Maya owes you ₪120. Close anyway?"* Deleting requires typing the group's name.

**Home needs no change at all.** `useOverallPosition` fans out over every group
from `useGroups()`, and `HomeScreen` already filters zero-net chips. So a closed
group still owing ₪120 keeps appearing, and a settled one drops out by itself.
That is exactly the rule we chose, and it falls out of code that already exists.

### 4. Member suggestions are a derivation, not an endpoint

`useGroups()` already caches every group you are in with its full member list.
"People you share a group with" is therefore a `useMemo` over data in hand, not
a request.

`features/groups/suggestions.ts` exposes `useMemberSuggestions(excludeIds)`:
every active member of every group you are in, minus you, minus anyone already
picked, ranked by shared-group count then name.

- **CreateGroupSheet** gains an "Add people" step — tappable chips of
  suggestions, plus the existing email input for anyone new. On create it POSTs
  the group, then one member per selection. A partial failure says *"Group
  created — 2 people couldn't be added"* rather than swallowing it.
- **AddMemberSheet** gains the same chip row above its email box. A chip adds by
  `user_id`, skipping the email round-trip and the typo that comes with it.

**Rejected: `GET /users/suggestions`.** The server could rank better — shared
expense recency, not just shared groups — and would work before the group list
loads. It is new API surface, a schema regeneration and a test suite for
something the client can already compute exactly. Worth building the day ranking
quality actually matters.

---

## What this does not change

- No change to balances, the settlement algorithm, or any splitting arithmetic.
- No change to how expenses are created — `expense_service` stays the only door,
  and the recurring toggle goes through the existing endpoints.
- No new layer, no new abstraction. `GroupPickerSheet`, `RecurringScreen` and
  `suggestions.ts` follow the existing feature-folder shape exactly.
- Hard delete stays hard. Closing is a separate concept, not soft delete
  wearing a new name: a closed group is fully visible and fully readable.

---

## Cross-cutting requirements

- Every new string is a key in `frontend/src/i18n/messages/`, English and
  Hebrew, Hebrew gender-neutral. Three guards apply to every new component:
  design tokens, logical properties, no bare strings.
- `npm run gen:api` after §3's backend change; commit `schema.d.ts`.
- Migration in the same commit as the model change.
- Every new endpoint gets a test in `tests/api/`.

---

## Sequencing

Four branches off `main`, smallest first so the largest lands against the most
settled trunk.

1. `feat/group-picker` (§1) — small, frontend only
2. `feat/member-suggestions` (§4) — small, no backend
3. `feat/close-groups` (§3) — migration + backend + frontend
4. `feat/recurring-ui` (§2) — largest; a screen, two sheets and a form section

Not one sitting. §2 alone is a mission's worth of work.

---

## Roadmap

These are new missions, not ticks against existing ones. Epic 6 is marked
complete and is complete — on the backend. The gap is that the roadmap has no
frontend column for it. Recording that when the missions are added.
