# StudentWise — design brief

The prompt below is what we paste into Claude Design to get the visual identity.
It lives here so it is version-controlled and re-runnable: if the first result is
not right, change the brief rather than arguing with the output.

**How the output gets applied.** Every colour, font, space, radius and shadow in
the app comes from `frontend/src/styles/theme.css`. Applying a new design is
editing that file plus the shared primitives in `frontend/src/ui/`. If applying a
design requires touching a screen, the token system has failed and that is worth
knowing about.

---

Design the visual identity and key screens for **StudentWise**, a mobile-first
expense-splitting app for Israeli students sharing flats, trips and relationships.
Think Splitwise or Tricount, but built by and for people in their early twenties
in Tel Aviv.

## Who uses it and when

Three roommates in a Tel Aviv flat. It gets opened standing in a supermarket
queue with one hand, on the bus after splitting a taxi, and at midnight when rent
is due and nobody wants to be the person who asks. Almost every session is under
thirty seconds: add what I just paid, or check what I am owed.

Money between friends is awkward. The app's job is to make settling up feel
light and already-handled rather than like accounting or like chasing a debt. It
should never feel like a bank, a spreadsheet, or a bill.

## What it has to show

Amounts in Israeli shekels (₪). Real example data to design against — use this, not
placeholder text:

- Flat: **Dizengoff 5**. Members: Gal, Maya, Noa.
- Expenses: Rent ₪6,000 (split by room size: 38.9% / 33.4% / 27.7%) · Electricity
  ₪284.50 · Supermarket ₪212.30 · Taxi to the airport ₪89 split between two of
  three · Dinner at Port Said ₪340
- Balances: Gal is owed ₪412.60. Maya owes ₪280.10. Noa owes ₪132.50.
- Settle up: one transfer clears it — "Maya pays Gal ₪280.10".
- Categories: Groceries, Rent, Utilities, Eating out, Entertainment, Transport,
  Other.

## Screens to design (in priority order)

1. **Home** — a cross-group activity feed, newest first, with a headline at the
   top answering the only question anyone opens the app for: *am I up or down,
   and by how much.* Feed rows are either an expense someone added or a payment
   someone recorded, and they read very differently from each other.
2. **Add an expense** — the screen that decides whether people use the app. Title,
   amount, who paid, date, category, and **who it is split between and how**. Four
   split modes: equally, exact amounts, percentages, or weights (e.g. rent by room
   size). Switching between them must not feel like four different screens. The
   common case — "₪212.30, split equally between all three of us" — should take
   about four taps; the rare case must still be reachable.
3. **Balances and settle up** — who is up, who is down, and the shortest set of
   transfers that clears everyone. One clear action per transfer: "record that
   this happened."
4. **Group detail** — the flat itself: its expense list with filters, its members
   and their split weights, its balances.
5. **Expense detail** — the amount, who paid, who owes what share, the receipt
   photo, and a comment thread ("why am I not on this one?").
6. **Log in / sign up** — two fields and a button, but it is the first thing
   anyone sees, so it has to set the tone.

## What I need back

1. **A token system, stated as concrete values I can paste into CSS custom
   properties:**
   - A palette of 6-10 named hex values covering: page ground, raised surface,
     primary text, secondary text, border, one accent, plus semantic colours for
     *owed to you* and *you owe*. Give me both a light and a dark set — the dark
     one designed, not inverted.
   - A type scale: two typefaces (display and body — name real ones, ideally on
     Google Fonts) with sizes, weights and line heights for each role. Amounts
     of money need their own treatment; they sit in columns and must line up, so
     tabular figures.
   - A spacing scale, corner radii, and how many elevation levels exist.
2. **The six screens above, at 390px wide**, plus Home and Group detail at
   1280px so I can see how the layout breathes on a desktop.
3. **The shared components**, drawn once each: button (its variants and states),
   text and amount inputs, the bottom tab bar, the top app bar, a list row, an
   avatar and an avatar stack, a category chip, a badge, a bottom sheet, an empty
   state, and a loading skeleton.

## Constraints

- **Mobile-first.** Design at 390 x 844. One-handed: primary actions in the lower
  third, nothing important in the top corners.
- Must also work at desktop width without looking like a stretched phone.
- **Light and dark themes**, both designed deliberately.
- The layout will later be flipped to **right-to-left for Hebrew** — so do not
  build anything whose meaning depends on left-to-right order, and keep icons
  direction-neutral where you can.
- It will be installed to an iOS home screen and run full-screen with no browser
  chrome, so it needs to look like an app, not a website.
- Money is the most important thing on almost every screen. The reader should be
  able to find the number without reading a sentence.

## What to avoid

Please do not hand me the current default look of AI-generated design: warm cream
grounds with a serif display face and a terracotta accent; near-black with a lone
acid-green accent; purple-to-blue gradient heroes; Inter or Space Grotesk as the
safe choice; emoji used as section markers; everything centred; the same rounded
card with the same shadow stamped on every block.

Take a real position. This is an app about money between friends, in Tel Aviv,
used in thirty-second bursts — that is a specific brief and it deserves a
specific look.
