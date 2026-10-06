# 2026-10-06 — Paying with Bit / PayBox (7.1–7.3) and the architecture diagrams (11.2)

Built by #3 (Dana, with Claude) on `feat/payments`, in a third worktree beside
the chat (8.x) and deployment (10.x) sessions running at the same time.

## What was built

- **7.3 Phone numbers.** `domain/phone.py` accepts an Israeli mobile in any usual
  spelling and stores it as E.164 (`+972501234567`); a landline is refused with
  a reason. Sign-up validates the same way, `PATCH /api/users/me` sets or
  clears it, and Settings has a phone section that checks the number in the
  app's language before sending it.
- **7.1 Pay.** On the Balances screen, your own debt in a shekel group has a
  Pay button. It opens a sheet with the payee's number and the amount, each with
  a copy button, plus Open Bit and Open PayBox.
- **7.2 "I paid".** From the pay sheet, this goes straight to the existing
  record sheet with the app already chosen and the amount filled in. That
  writes the `settlements` row. Nothing moves a balance before that.
- **11.2** [`docs/architecture.md`](../architecture.md): the layers, the database in
  two diagrams (generated from the models), the four ways an expense is
  created, how balances become a settlement plan and a payment, and how the AI
  reads data safely. All seven Mermaid diagrams were rendered to check them.

## Decisions, and why

- **No deep link.** Neither app publishes a link that opens a payment with a
  person and an amount filled in. Bit's developer portal is for merchant
  checkouts with a business account, and PayBox has nothing. Undocumented URL
  schemes exist, but they break silently after an app update, on someone's
  phone, at the cash point. So Open goes to the app's App Store or Google Play
  page, which shows "Open" when the app is installed, and the person pastes the
  number and amount. That's two taps more, and none of it can break. The store
  IDs were checked against both stores. On a computer, the sheet says to use
  the phone instead.
- **What gets copied is what the other app wants:** the national number as
  digits (`0521234567`) and the amount as a plain decimal (`1474.76`), with no ₪
  sign and no grouping comma.
- **Shekel groups only.** Both apps pay in ILS, so offering Bit on the Berlin
  trip would send the right number in the wrong currency.
- **Mobile only.** A landline would look as if it saved and then fail at the
  moment of paying.
- **No phone numbers in the seed.** A made-up Israeli mobile could belong to a
  real person, and "Open Bit" would then help a tester pay a stranger. To demo
  this, sign in as Maya and put your own number in Settings.

## What surprised us

- **User search was a phone book.** `/api/users/search` returned `UserOut`, so
  anyone signed in could type three letters of an email and get up to ten
  strangers' phone numbers. It now returns `UserSearchOut` (id, name, email).
  A phone number is seen only by its owner and by people who share a group with
  them. 7.3 would have made this much worse, which is why it was fixed as part
  of 7.3.
- **Every sheet shared one fixed title id.** That was harmless with one sheet
  per screen. Balances now has two, so `Sheet` uses `useId`.
- **The cash button vanished on the dark card.** A ghost button is dark text on
  a light background, so on the dark slab it was invisible. Only the
  screenshot showed it: every test passed.
- **user-event replaces `navigator.clipboard`** when `userEvent.setup()` runs, so
  a test's fake clipboard has to be installed after it.
- The right-to-left guard reads string literals, so a test titled "...left-to-right..."
  fails it.

## Verified

- 1,091 backend and 403 frontend tests pass. ruff, alembic check, tsc, eslint,
  prettier and the build are clean. The schema regenerates identically after
  the rebase onto the chat merge.
- A real browser run (Edge on an emulated iPhone, against this branch's own API
  and database) passed 21 checks:
  - Maya saves a number, and a landline is refused in words.
  - Search shows nobody's phone, even to someone outside her groups.
  - Gal sees Pay Maya. The clipboard gets `0521234567` and `1474.76`.
  - Open PayBox goes to `apps.apple.com` and redirects to `itms-appss://`,
    which is what opens the App Store app on a real iPhone, and the app stays
    open in its own tab.
  - "I paid" opens the record sheet set to PayBox, and recording writes a
    PAYBOX settlement that removes the transfer from the plan.
  - Hebrew keeps the number left-to-right, and a computer gets no store links.

## What's next

- **On a real iPhone and Android:** check that Open lands in the installed Bit
  or PayBox, and that pasting the copied number and amount works there. This
  needs the deployed HTTPS address (Epic 10), and it can't be checked anywhere
  else.
- When `receipt_images` (10.3) and `expense_embeddings` (8.3) merge, add them to
  the database diagram in `architecture.md`.
