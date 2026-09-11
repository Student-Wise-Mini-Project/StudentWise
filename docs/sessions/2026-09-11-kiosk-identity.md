# 2026-09-11 — Applying the "Kiosk" visual identity

Branch: `feat/kiosk-identity`. Eight commits, one per step of the handoff.

The Claude Design output for `docs/design-brief.md` came back as
`design_handoff_studentwise_identity/` — a token file, a component spec, six
screens at 390×844, two desktop layouts and a Hebrew RTL proof. This session
applied it.

## What was built

**Tokens.** `frontend/src/styles/theme.css` was replaced wholesale. Every
existing `--sw-*` name survived, which is the thing the guard test was built to
make possible, and four are new: `--sw-slab` / `--sw-on-slab` (the inverted
money block, dark in *both* themes), `--sw-slab-credit` / `-debt`, `--sw-on-avatar`
and `--text-hero`. Radii tightened to 4/8/12/16/22. Rubik gave way to Heebo,
which now carries every number at 800/900.

**Components.** Eleven files, most of them one or two lines. Avatars became
squares, cards became hairlines, the segmented thumb became a filled accent
block, EmptyState went left-aligned, the skeleton became a travelling shimmer.

**Screens.** All six were rebuilt against the existing components: Home,
add-an-expense, balances, group detail, expense detail, auth.

## Decisions, and why

**A card is a border, not a shadow.** `--shadow-raised` is gone from the token
file entirely, and `Card`'s `elevated` prop was **deleted** rather than made a
no-op, so the compiler named all six call sites that assumed one. There are now
exactly two elevation levels above flat and both are reserved: `float` for
things that move (the FAB bar, a toast), `sheet` for the bottom sheet.

**Exactly one inverted slab per screen.** A new `components/Slab.tsx`. Home and
Balances each have one; expense detail and the editor have none (their headline
number is a total, not a position); group detail deliberately has a *surface
strip* rather than a slab, because the Balances tab underneath owns that
screen's slab and two inverted blocks would be two competing headlines. The
handoff's desktop mock shows a slab in the group's side column — making the
strip invert depending on the open tab would break the rule the moment somebody
tapped Balances, so it stays a strip at every width.

**The two Home feed rows are not one shape.** An expense gets a face and a heavy
amount; a payment gets a quiet tinted band, a two-way arrow, one sentence and a
small number. A payment is news, not a liability, and the two have to be told
apart before either is read.

**"You lent ₪141.53" is a subtraction, not a division.** Total minus the
server's own allocation of my share. No `≈` is shown on it, because nothing was
estimated.

**The ≈ preview stays off % and Weights.** The handoff asks for one. Two tests
in `SplitEditor.test.tsx` exist specifically to forbid it, with the reasoning
written out: turning a percentage into money is one multiplication and exactly
the re-derivation `docs/api-contract.md` forbids. Raised it rather than picking
a side; Gal confirmed the tests win. The four modes still read as one screen via
the shared header, list and avatars, with only the trailing control and one
summary line changing.

**Money now signs itself when the tone says it should.** `tone="credit"` /
`"debt"` / `"auto"` mean "this is a balance", so they default `sign` to
`always`. A plain total still has no sign. An explicit `sign` prop still wins.

## The RTL problem, and where the fix ended up

`logical-props.test.ts` catches physical utilities. It cannot catch a *reordered
glyph*, and that is the one that bites: the neutral characters at an amount's
edges — a leading `+` or `−`, the `₪` — are moved by the surrounding paragraph
under `dir="rtl"`, so `+₪412.60` renders as `₪412.60+`. The digits are fine;
Unicode treats them as weak and renders them left-to-right either way. It is the
sign, the most load-bearing character in this app, that moves.

The first fix was an inline style inside `<Money>`. That was wrong, and finding
out why was the most useful thing in the session: **`<Money>` is not the only
thing that renders an amount.** `InsightsScreen` formats money into plain
strings and hands them to `charts.tsx` as labels, which never touch the
component. So the isolation now lives in `base.css` as `.amount`, and both use
it.

It is deliberately *not* folded into `.tnum`. That class also lands on inputs and
on plain counts, and forcing `direction: ltr` there would flip what `text-end`
resolves to inside a mirrored row.

Two more, both fixed: the settle-up `payer → payee` pair is isolated as one
left-to-right unit (it says the opposite of what happened otherwise) with the
same fact repeated in words underneath, and thirteen English sentences inside
the shell carry `dir="auto"` so a full stop cannot jump to the front.

## What surprised us

**The guard flagged its own documentation.** Two new test *names* contained the
words "right-to-left" and "left-to-right", and `logical-props.test.ts` matched
`right-` and `left-` inside them. It scans string literals on purpose — that is
where class names live — and it cannot tell prose from a utility. The prose was
renamed. Weakening the guard to skip strings would have blinded it to the exact
thing it is for.

**The one-file promise held for colour and not for layout, which is correct.**
`theme.css` really was a drop-in replacement and the components really were one
or two lines each. The screens were rebuilt. That is not a failure of the token
system: a token system promises a *recolour* is one file, never that a new
layout is. Worth writing down before somebody reads the old roadmap note and
concludes the guard underdelivered.

**`Card`'s `elevated` prop had six callers.** Deleting the prop instead of
neutering it turned a silent visual regression into six compiler errors.

## Deviations from the handoff, all deliberate

- No `≈` preview on % and Weight splits (above).
- No `≈` on the per-person amounts in expense detail — those are the server's
  exact largest-remainder numbers, and marking them approximate would be the app
  apologising for a figure it is certain about.
- No overflow menu in the group app bar: the handoff shows one, there is no
  group-settings route, and the brief says no new routes.
- Group detail's header strip is not a slab (above).

## Not done

- **Inputs are 15px, and the spec says 16px minimum** because iOS zooms the page
  on focus below that. Pre-existing, not introduced here, and the type scale has
  no 16px step — fixing it properly means a token decision rather than an
  arbitrary value in one component. Left for whoever owns that call.
- **No browser walk-through.** Both themes and `dir="rtl"` were audited in
  source and covered by tests; nobody opened the six screens in a browser at
  390px and looked. Worth twenty minutes before this merges.

## Next

Epic 9 still wants the Ask screen (9.9), anomaly alerts (9.10) and the APK
(9.12). The roadmap's Epic 9 note and the published `roadmap.html` both said the
identity was a placeholder awaiting Claude Design; both now say it has landed,
and the "run the design brief" blocker is gone from the published page.

---

## Addendum — what a real phone found

Two bugs came back from an iPhone 14 within minutes of the branch being looked
at. Both are worth recording, because neither was visible from the desk it was
written at and one of them was not the bug it appeared to be.

### The activity feed showed one day, not many

Reported as "the home page does not divide by dates". The grouping code was
correct; the **data** was wrong. `created_at` defaults to `clock_timestamp()`,
which is right for the app and wrong for a seed — one run stamps six weeks of
history with the moment the script executed. The feed orders and groups by
`created_at`, so every row landed under a single "Today".

`seed.py` now has a `backdate()` pass that pushes each row onto its own event
date once everything is written. `updated_at` moves with it, or every seeded
expense reports itself as edited — the detail screen decides that by comparing
the two.

**The lesson is about seed data, not about the feed.** Any view ordered by
insert time is degenerate against a seed that inserts everything at once, and
that includes the pagination the whole activity API is built on. A seed that
does not look like history is not exercising the thing it exists to exercise.

### "The home page does not fit my iPhone 14"

This one nearly became a wrong fix. The obvious reading is horizontal overflow,
and the obvious response is to go hunting through CSS for the element that is
too wide.

Measuring first said otherwise: `scrollWidth === clientWidth === 390` on all
nine screens. There was no overflow and there never had been.

It was iOS Safari's auto-zoom. It fires when a field with a font smaller than
16px takes focus, and it does not zoom back out — one tap on the login form and
every screen after it stays magnified until the user pinches out by hand. The
symptom names the *page you noticed it on*, not the control that caused it,
which is why the report pointed at Home and the bug was on `/login`.

Login's inputs measured 15px. `--text-control` is now a 16px token used by every
typeable control. This was the exact item this session's "Not done" list had
flagged and deferred, with the spec's own reasoning quoted — it took about a day
to bite.

### What changed in how we debug

`frontend/src/dev/overflowProbe.ts`, wired into the existing `?debug` console:
it asks the browser which element sticks out past the viewport, innermost first,
instead of making the next person read CSS and guess. The design-tokens guard
caught a hex colour in the probe's own console styling on its first run.

More usefully: Playwright is already in the local cache, and driving a real
Chromium at `devices['iPhone 14']` against the running dev server answered both
questions in minutes — computed font sizes per control, `scrollWidth` per
screen, and a screenshot. That is now the cheapest way to check a layout claim
about a phone, and it is what turned "the layout is broken" into "the layout is
fine, the keyboard zoomed you".
