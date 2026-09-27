# Scanning a receipt, end to end

**Date:** 2026-09-27
**Branch:** `feat/receipt-ocr` off `main`
**Missions:** 5.1, 5.2, 5.4, 5.5 (Epic 5). Built by #3, not #2 as the
roadmap had planned. Hila, this is why they are ticked: voice (5.6/5.7) and
Gmail (5.8/5.9) are still yours.

---

## What prompted it

The first AI mission to reach a user: photograph a supermarket receipt, let
Claude read it, fix what it got wrong, mark who shared which line, and save it as
an ordinary expense. Specifically asked for: a line only some people shared is
marked with those people's colours, and a line nobody marked is split between
everyone.

## What was built

**5.1 — tables.** `expense_items` (a receipt line: position, name, amount > 0)
and `item_splits` (who was on it), both cascading from the expense. One
migration, `026e0e97e0b1`.

**5.2 — splitting by line.** `compute_item_splits` in `domain/splitting.py`,
reusing the largest-remainder allocator. `POST /groups/{id}/expenses` takes
`items`; the server works out each person's share and saves it as a plain
`EXACT` split through `expense_service.build_expense`, so notifications, the
budget check and idempotency all apply unchanged. New
`POST /groups/{id}/expenses/item-preview` answers "who would owe what" without
writing.

**5.4 — reading the photo.** `app/ai/receipt_ocr.py` and
`POST /groups/{id}/receipts/scan`. The photo is checked the same way a receipt
upload is (bytes, not `Content-Type`; 5 MB), sent to Claude with a Pydantic
output schema through `messages.parse`, and cleaned into a draft: amounts parsed
as `Decimal` (including `12,90` and Israeli `5.00-` discounts), unreadable lines
dropped and flagged, and warnings returned as codes.

**5.5 — review and confirm.** `features/receipts/` in the frontend: pick a
photo (camera on a phone), a reading screen, **check** (every field and line
editable, the gap between lines and total shown as a discount or an extra),
**split** (a person's chip is a brush; tap lines to mark them; with no brush,
a line opens a list of names), save, attach the photo. The "Scan a receipt"
button is at the top of the new-expense screen. The detail screen lists the
lines and who was on each.

## Decisions, and why

- **The scan stores nothing.** The expense does not exist yet when the photo is
  read, receipt files are named after their expense, and a stored draft would
  need something to clean up the ones nobody confirmed -- and nothing here runs
  on a scheduler. So the scan returns a draft, and the photo is uploaded again
  after the expense is created. A failed photo upload leaves the expense saved
  and says so, the same pattern as the "repeats" toggle.
- **A discount is the gap, not a line.** Lines must be positive. Whatever
  separates them from the total -- club discount, service charge, tip, a line
  the camera missed -- is spread in proportion to each person's lines. A
  negative line would hand the whole discount to whoever was marked on it.
- **An unmarked line is stored with every name written out.** "No names means
  everyone" is resolved at write time, so an old receipt does not quietly start
  to include somebody who joined later.
- **Items explain the split; they are not the split.** Balances, settle-up and
  analytics read `expense_splits` exactly as before -- the constraint the epic
  was written around. A PATCH that changes the split removes the items, because
  they would no longer add up to it. The edit screen therefore leaves the split
  out of the request when it has not changed, so renaming a receipt keeps its
  lines, and warns that changing it replaces them.
- **Per-person totals come from the server.** The client may not divide money
  (frontend rule 12). `item-preview` runs the same function as the save, so the
  numbers on the review screen are the numbers that get stored.
- **Warnings are codes** (`TOTAL_MISSING`, `CURRENCY_MISMATCH`, ...) so they are
  translated like everything else. Hebrew strings are gender-neutral: the split
  step is "מה של מי", not "מי לקח מה".
- **Colours are the avatars'.** No new tokens: a person's mark on a line is
  their avatar, the same colour and initial as everywhere else, which also works
  for someone who cannot tell two colours apart.
- **Model: `claude-sonnet-5`**, for cost ($2/$10 per million tokens against
  Opus 5's $5/$25), set by `RECEIPT_OCR_MODEL`. The Ask endpoint was moved to
  Sonnet at the same time (`NL_QUERY_MODEL`). Either can go back to
  `claude-opus-5` in `.env` if accuracy turns out to need it. One retry and a
  90-second timeout, because a person is watching a spinner.

## What surprised us

- **The SDK sends Pydantic docstrings to the model.** Running the SDK's own
  schema transform on the output model showed `ExpenseCategory`'s developer
  docstring ("When the AI modules land...") going out as the schema's
  description on every request. The model now sees its own `Literal` of
  categories, with a unit test keeping it equal to the enum.
- **`MoneyInput` ignores a cleared field** on purpose ("not a number yet"), so
  the only way to make a line invalid from the UI is to type `0`. A test that
  cleared the field was testing something a user cannot do.
- **The edit form always sends the split.** Harmless for every other expense;
  for an itemized one it would have wiped the lines on a title fix.
- **The "+ Add expense" bar showed on the scan screens.** Only visible in the
  browser run, not in any test -- tapping it mid-scan would have thrown the
  reading away. Hidden now, with a route test.

## Verification

- Backend: 761 tests (89 new), `ruff`, `alembic check`, and the migration
  downgraded and re-applied.
- Frontend: 285 tests (32 new), `tsc`, ESLint, Prettier, production build. The
  three guards (colours, direction utilities, bare strings) pass.
- In a browser: the real API with only the Claude call replaced by a canned
  Hebrew receipt, driven through Edge at phone size in English and Hebrew --
  scan, check, brush-marking, the per-line sheet, save, detail. No console
  errors; the saved split adds up to the receipt total.

## Not done / next

- **Real-receipt accuracy is unmeasured.** Every test stubs the model; there is
  no `ANTHROPIC_API_KEY` on this machine. Same shape as 4.4: collect ~20 real
  receipts with known lines and totals and measure.
- Splitting one line by quantity ("Maya had two of the three") or by uneven
  shares.
- Editing an itemized expense's lines after saving.
- Scanning a receipt already attached to an old expense.
- The browser run added one "שופרסל דיל" expense to Dizengoff 5 in the local
  demo database; `python seed.py` resets it.
