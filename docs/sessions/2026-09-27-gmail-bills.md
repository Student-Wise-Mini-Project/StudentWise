# Utility bills from Gmail

**Date:** 2026-09-27
**Branch:** `feat/gmail-bills`, on top of `feat/receipt-ocr`
**Missions:** 5.8, 5.9, and a new 5.10 (routing a bill to the right flat).
Built by #3. Hila: voice (5.6/5.7) is what is left in Epic 5.

---

## What prompted it

A spec for "Automated Recurring Bill Ingestion": connect Gmail, fetch utility
bills, have an LLM read them, and split each in the right flat -- including
for someone who lives in more than one. It was checked against CLAUDE.md and
the roadmap before any code, and five parts of it were overruled (below).

## What was built

- **Connecting** (5.8): `gmail_connections` (one per user, refresh token
  Fernet-encrypted), `POST /integrations/gmail/connect` returning Google's
  consent URL, the callback, status, disconnect (revokes at Google).
- **Reading** (5.9): `app/ai/gmail.py` walks Gmail's MIME tree to the body
  text and a PDF or image attachment; `app/ai/bill_parser.py` has Claude read
  the provider, amount due, due date, billing period, customer, service
  address and invoice number, through `messages.parse`.
- **Routing** (5.10): `domain/address_matching.py` and `domain/bill_routing.py`
  -- pure, fully unit-tested -- decide the flat and whether a person must look
  first. `ingested_bills` records every email once. `POST /integrations/gmail/sync`,
  `GET /bills`, approve and dismiss. `groups.address`, editable on the Members tab.
- **Frontend**: a Gmail section in Settings, a "Bills to review" screen, a
  banner on Home, a sync once per session when the app opens, and the flat's
  address field. English and Hebrew.
- `fetch_new_bills.py` for cron; `docs/gmail-setup.md` for the Google side.

## Decisions, and why

**Overruling the spec:**

- **No Celery.** The roadmap is explicit that nothing runs on a scheduler.
  The sync is triggered and idempotent, exactly like recurring bills.
- **Anthropic, not OpenAI.** Same SDK and pattern as receipts and Ask.
- **No `status` column on `expenses`.** Seventeen modules read expenses as
  money. A pending bill in that table would have needed a filter in every one,
  and missing one means an unapproved bill moves a balance. Pending bills are
  their own table and become ordinary expenses only once decided -- the same
  "nothing touches money until decided" rule as receipt scans.
- **No ItemSplits, no settlement "trigger".** A bill is one amount: a `WEIGHT`
  split at each member's `default_split_weight` (a standing split rule still
  wins). The settle-up plan is computed on read, so there is nothing to trigger.
- **The bill belongs to the mailbox owner**, not to a fuzzy match on
  `billed_to_name` -- we already know whose inbox it came from, and "ישראל
  ישראלי" on a bill rarely matches "Gal" in the app.

**Added to the spec:**

- **Only open `SHARED_APARTMENT` groups are candidates.** The demo user is in
  five groups; "exactly one group" would never have applied.
- **House numbers are compared exactly** before rapidfuzz sees the words, and a
  flat is chosen only with a score of 85+ *and* a 10-point lead. Two flats on
  the same street in different cities both score 100, and refusing is right.
- **Trusted senders only** are split unasked. Anyone can email a convincing
  "לתשלום ₪2,000".
- **A fixed-amount recurring bill** of the same category sends the email bill
  to review; a recurring bill *without* an amount is waiting for exactly this.
- **Same invoice from a flatmate's mailbox** is skipped, not split twice.
- **The OAuth state has its own JWT audience.** `decode_access_token` names no
  audience, so PyJWT refuses the state as a login token -- tested both ways.
- **An email that is not a bill keeps nothing** but its message id.

## What surprised us

- **Autogenerate wrote every enum CHECK constraint twice** under the same name
  for the new table, which Postgres refuses. Caught on first `upgrade`.
- **A row flushed before its status was decided** broke the NOT NULL on
  `status`: the row needs an id before the expense that records it. Every row
  now starts as PENDING_REVIEW.
- **`sync_everyone` iterated ORM rows across a rollback**, which expires them.
  It loops over a snapshot of ids instead.
- **Claude got every trap in the test bill**: 418.26 rather than the 822.02
  consumption line or the ₪500 refund, and the property address rather than a
  separate Ramat Gan mailing address.

**Two more, from the real inbox** (danaber113@gmail.com), neither of which any
stubbed test could have found:

- **A forwarded bill with an empty subject was never found.** The search
  matched subjects and senders only. It now also matches attachment names
  (`filename:(bill OR invoice OR חשבון OR חשבונית)`) -- one extra match on the
  real inbox, where "every PDF" would have been sixteen model calls.
- **A deleted expense blocked its bill forever.** The duplicate check counted
  an imported bill whose expense had since been deleted (`expense_id` NULL), so
  the same bill arriving again was skipped as a duplicate of nothing. It now
  only counts bills whose expense still exists; regression test added.

## Verification

- Backend: 866 tests (105 new), `ruff`, `alembic check`, migration round-trip.
- Frontend: 301 tests (16 new), `tsc`, ESLint, Prettier, production build.
- In a browser, real Claude, real database, only Google replaced: set the flat
  address, connect, open the app, three emails -> one split automatically
  (matched by address over a second flat, score 100), one waiting (unknown
  sender, flat suggested), one newsletter skipped with nothing kept; approve;
  sync again reads nothing. 22/22 checks, no console errors, English and Hebrew.

- **Real Google, real Gmail**: connected danaber113@gmail.com through the
  consent screen; the sync read 8 matching emails, skipped 7 real non-bills,
  and read the forwarded PDF correctly on every field (418.26, due 2026-10-08,
  invoice 7700412-2609, the property address). It waited for review -- the
  sender is not a utility -- with Dizengoff 5 suggested; approving it made a
  normal expense split 139.42 × 3.

## Not done / next

- The post-sign-up "Connect Gmail?" step.
- Real-bill accuracy is measured on one generated bill, not on a set.
- Link-only bills (a portal link, no attachment) can only be typed in.
- The trusted-sender list is a starting guess at Israeli utility domains and
  should be checked against real bills.
