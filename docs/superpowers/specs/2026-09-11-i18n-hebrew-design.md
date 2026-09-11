# Hebrew, and the i18n layer under it

**Date:** 2026-09-11
**Branch:** `feat/i18n-hebrew`, stacked on `feat/kiosk-identity`
**Status:** design approved, plan pending

---

## Why now

The app has been built RTL-ready from the start and translation was deliberately
deferred. `lib/labels.ts` says so in as many words:

> Deliberately _not_ a full i18n system. The choice made was "RTL-ready", which
> is a layout problem that logical CSS properties solve. Translation is a
> separate axis, and routing every button label through `t('...')` before anyone
> needs a second language buys indirection rather than readiness.

That call was right and it has now come due. The layout axis is finished — the
RTL pass (`a6f8fbd`) closed the three bidi holes that logical properties cannot
reach, `logical-props.test.ts` guards the utilities, and Heebo and Assistant
were chosen at scaffold time because both ship full Hebrew. What is left is the
words.

This mission is the translation axis and nothing else. It adds no screens and
changes no layout.

---

## Decisions

### 1. Notification and error wording moves to the client

Notification text is rendered **on the backend**, in Python, at read time —
`notification_service.render()` builds English sentences and the API returns
them already-worded. A frontend-only translation would leave the Alerts screen
in English while the rest of the app is Hebrew.

No backend change is needed, because the API was built for this. From
`schemas/notification.py`:

> `payload` is included as well so a client that wants to write its own wording
> (in Hebrew, say) never has to parse English.

So the client renders its own wording from `kind` + `payload`, and keeps the
server's `title` / `body` as the fallback for any `kind` it does not recognise.

**Rejected:** an `Accept-Language` header driving a Hebrew branch inside
`render()`. It is the right answer the day notifications are emailed or pushed,
because then no client is in the room. Today it splits one catalogue across two
languages and two repos, and it edits Gal-owned service code to solve a
presentation problem.

### 2. A hand-rolled typed `t()`, not a library

About 120 lines: a context, a hook, `{name}` interpolation, and
`Intl.PluralRules`. Zero dependencies.

The reason is not weight, it is the type system. Keys are derived from the
English catalogue, so `t('expenses.editr.title')` is a compile error, and `he`
is typed `Record<MessageKey, string>`, so a Hebrew string nobody wrote is a
compile error too. `i18next` reaches the same place only through module
augmentation set up by hand, and `react-intl` does not reach it at all. `tsc`
already runs in `npm run build` and in CI, so this costs nothing to enforce and
cannot be forgotten.

What a library would have bought and we are giving up: gendered `context` (see
decision 3, which removes the need), lazy-loaded locales (two locales, ~14 kB of
JSON — not worth a loader), and extraction tooling (the guard in decision 5
covers the same failure).

### 3. Neutral Hebrew, no gender marking

Hebrew marks gender on verbs and adjectives in both the second and third person.
The API stores no gender for a user and should not start.

Every Hebrew string is phrased so the question does not arise — noun phrases and
passive constructions instead of gendered verbs:

| Instead of      | Write                  |
| --------------- | ---------------------- |
| אתה חייב ₪42    | החוב שלך: ₪42          |
| גל הוסיף הוצאה  | נוספה הוצאה על ידי גל  |
| אתה מוזמן לקבוצה | הוזמנת לקבוצה         |

**Rejected:** slash forms (`חייב/ת`), which are mechanical but read as
bureaucracy, and a masculine default, which misgenders half the users of an app
built for flatshares.

This is a _writing_ constraint, not a code one. It is recorded here because
nothing in the build can enforce it and the next person adding a string needs to
know the rule exists.

### 4. Detect, fall back to Hebrew, switch in Settings

`navigator.language` on first run; anything that is not recognisably English
gets Hebrew, because the audience is Israeli students paying in ₪ through Bit
and PayBox. English stays a real second language — it is the key source of
truth, and the team reviews the app in it.

The choice is stored per-device in `lib/prefs.ts` beside the theme, for the
reason already written at the top of that file: it belongs to the phone, not to
whoever is signed in on it, and it survives signing out.

### 5. A third guard test

`design-tokens.test.ts` and `logical-props.test.ts` both exist because their
rule fails quietly. A half-translated app fails the same way: it does not crash,
it just shows one English button in the middle of a Hebrew screen.
`no-bare-strings.test.ts` joins them.

---

## Architecture

### `src/i18n/`

```
src/i18n/
  messages/en/*.json       source of truth for keys
  messages/he/*.json       typed Record<MessageKey, string>
  messages/index.ts        barrel: merges namespaces, flattens to dotted keys
  types.ts                 MessageKey, Locale
  I18nProvider.tsx         context, and the <html lang/dir> effect
  useT.ts                  the hook
  format.ts                interpolation + Intl.PluralRules
```

Ten namespaces, one file per feature area per language: `common`, `auth`,
`groups`, `expenses`, `balances`, `activity`, `notifications`, `analytics`,
`settings`, `errors`.

One file per language would be ~450 keys in one place. The split follows the
reasoning CLAUDE.md rule 2 gives for the backend — _"three people edit different
entities without touching the same file"_ — and leaves room for Teammate 2 to
add `ai.json` without touching this work. The barrel merges them into one
object, so the split costs nothing at the type level: `MessageKey` is still a
single union.

### The type

```ts
type Flatten<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends PluralForms
      ? `${P}${K}`
      : Flatten<T[K], `${P}${K}.`>
}[keyof T & string]

export type MessageKey = Flatten<typeof en>
```

The flattener stops descending at a plural object, so `{one, two, many, other}`
is one key rather than four.

### The API

```ts
const t = useT()

t('expenses.editor.title') // plain
t('groups.memberCount', { count: 2 }) // plural — Hebrew has a `two` category
t('balances.owedTo', { name: user.name }) // interpolation
```

`Intl.PluralRules('he')` is why plurals are not a `count === 1` ternary: Hebrew
distinguishes `one`, `two`, `many` and `other`, so "2 members" is not formed like
"3 members" and an English-shaped ternary gets it wrong in a way nobody on this
team would notice.

### The direction flip

`lib/prefs.ts` gains `readStoredLocale()` / `applyLocale()`, mirroring
`readStoredTheme` / `applyTheme` exactly — same key prefix, same try/catch around
`localStorage`, same per-device reasoning.

`applyLocale` sets `documentElement.lang` and `documentElement.dir`.

`index.html` gets the locale added to the pre-paint inline script it already runs
for the theme, for the reason stated there — without it the page renders in the
wrong state for a frame and then snaps. A frame of LTR before snapping to RTL is
worse than a colour flash: the whole layout mirrors.

### Locale-aware formatting

`lib/dates.ts` hardcodes `'en-GB'` in six `Intl.DateTimeFormat` instances and
`'en'` in one `RelativeTimeFormat`. `lib/money.ts` hardcodes `'en-IL'`. Both
become locale-aware and both cache formatters keyed by locale — money already
caches, dates currently build at module scope and will move behind the same kind
of `Map`.

The only prose in `dates.ts` — `'just now'`, `'Today'`, `'Yesterday'` — moves
into `common.json`.

`formatMoney` needs no change beyond the locale: `Intl.NumberFormat` already
decides which side the ₪ goes on, which is why that file says it handles RTL
"without this file knowing anything about direction". The `.amount` rule in
`base.css` stays exactly as it is — it is what stops a leading `+` or `−` from
being reordered to the end, and it is more load-bearing in Hebrew than it was in
English.

### `lib/labels.ts`

Stops exporting `Record<Enum, string>` maps and starts exporting functions that
take `t`. Its own docstring predicted this: _"when that happens a second table
goes in this file and every screen follows, because no screen writes
`SHARED_APARTMENT` into the DOM itself."_ That held — the enum labels are the one
part of this mission that is a rename rather than a rewrite.

`app/nav/navItems.ts` has the same shape: `label` becomes a `MessageKey` and the
two nav components translate at render.

### Notifications

`features/notifications/render.ts` — a direct port of the `match` statement at
`notification_service.py:271`, covering all seven kinds, in neutral Hebrew. Where
the server says `Gal added "Pizza"`, the client composes from
`payload.actor_name` and `payload.expense_title`.

Falls back to the server's `title` / `body` for an unrecognised `kind`, so a
notification kind added by the AI work degrades to English rather than to blank.

### Errors

`errors.json` keyed by HTTP status, replacing the `switch` in
`defaultForStatus`. The server's `detail` string still wins when it is present
and recognised; an unrecognised detail falls through to English. That is a
visible seam and it is the right one — an unknown error in the user's own words
beats a correct-looking Hebrew message that says the wrong thing.

---

## Coverage

45 `.tsx` files ship outside `dev/` and `test/`; 28 of them carry prose today. Plus
five `.ts` files holding prose:
`lib/labels.ts`, `lib/dates.ts`, `api/errors.ts`, `app/nav/navItems.ts`, and
`features/expenses/splitValidation.ts`.

`dev/KitchenSink.tsx` is **exempt**. It holds the single largest concentration of
strings in the app (64) and every one of them names a _component_ for a
developer, not a product concept for a user. It is not shipped.

---

## The guard

`src/test/guards/no-bare-strings.test.ts`, reusing `sourceFiles.ts` and its
`stripComments` helper like the other two guards.

Scans:

- JSX text nodes
- a fixed list of text-bearing props: `title`, `label`, `subtitle`,
  `placeholder`, `body`, `empty`, `header`, `hint`, `aria-label`

`aria-label` is on the list because an accessible name is user-visible — the
close button in `Sheet.tsx` is `aria-label="Close"` today, and a screen reader in
Hebrew would read it out in English.

Must not flag: `className`, `to`, `name`, `id`, `role`, test ids, enum values,
`import` paths. The rule is "two or more Latin words, or one capitalised word, in
a text position". It will be tuned against the fully translated tree and must
land at **zero false positives** before it is committed — a guard people route
around with comments is worse than no guard.

Exempt: `dev/`, `test/`, `src/i18n/messages/` (the English catalogue is bare
strings by definition).

---

## Testing

`npm test` runs on happy-dom, which **does not implement the Unicode bidi
algorithm**. The RTL pass already hit this and settled on the right answer: test
that the mechanism is present, because the mechanism being absent is the whole
failure mode.

New tests:

- `applyLocale('he')` puts `dir="rtl"` and `lang="he"` on `<html>`
- `t` returns Hebrew for a known key under a Hebrew provider
- `Intl.PluralRules('he').select(2)` is `two`, and the catalogue's plural objects
  carry a `two` form wherever they carry `one`
- interpolation fills `{name}` and leaves an unknown placeholder alone
- the notification renderer produces a title and body for all seven kinds
- the guard finds files (it is not silently empty) — the same assertion the other
  two guards open with

Existing tests that assert on English text get an explicit English locale rather
than being rewritten into Hebrew. English is a supported language, the assertions
are still true, and rewriting them would mean the suite no longer proves the
English path works.

---

## Out of scope

- Backend `Accept-Language`. Revisit when notifications are emailed or pushed.
- Arabic or any third language. The mechanism supports it; nobody has asked.
- Translating `dev/KitchenSink.tsx`.
- Hebrew content in the PWA manifest and `index.html` meta description. The
  manifest is generated at build time from one config and would need a build step
  to vary by locale; the install prompt is a one-time surface. Worth doing, not
  worth blocking this on.
- Number-to-Hebrew-words, ordinals, or any typographic Hebrew niceties.

---

## Risks

**The guard's false-positive rate.** The mitigation is sequencing: the guard is
written _after_ the tree is translated, tuned against it, and only then
committed.

**Hebrew review.** Nobody but Gal on this team reads Hebrew as a reviewer of
record. The neutral-phrasing rule is the part most likely to erode, and it erodes
silently. Recorded here and in the catalogue's header comment; not enforceable in
CI.

**Branch stacking.** This sits on `feat/kiosk-identity`, which is 16 commits
ahead of `main` and unmerged. Per CLAUDE.md: do not delete the base while this is
stacked on it, and after the base is rebase-merged this branch needs
`git rebase --onto origin/main <old base sha>`.
