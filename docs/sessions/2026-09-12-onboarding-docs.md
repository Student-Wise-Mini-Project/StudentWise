# 2026-09-12 — Onboarding and contributor docs

No code changed. This was a pass over everything a new person reads before they
write a line, prompted by the fact that two of three people still have not
cloned the repo and will do so cold.

## What was built

**`docs/testing.md`, new.** The demo world had no documentation of its own.
`seed.py` has quietly grown into seven users and six groups, each group chosen
to make one branch of the code visible — EUR instead of ILS, a group the main
account does not own, one settled to exactly zero, one with a single member, and
one the main account is deliberately not in. That last one is a test fixture you
can click: a group list that forgot its membership filter is visible in one
screenful. None of this was written down anywhere, so the page now covers:

- all seven accounts and what each is useful for
- all six groups and what each one proves
- signing in three ways — `/docs`, the app, and a raw token, including that
  `POST /api/auth/login` is form-encoded and the field is called `username`
  while holding an email
- the five checks that prove an environment, and about a dozen "go and look at
  this one" endpoints
- both test suites: the separate `studentwise_test` database, why the test
  schema is built by migrating rather than `create_all`, why every test can
  commit and still be isolated, and what the three frontend guard tests catch
- the three CI jobs and the local command for each

**`docs/onboarding.md`, rewritten.** It had drifted in four places that would
each have cost a newcomer real time:

1. It described a seed of *one flat and three users* that has been seven users
   and six groups for days.
2. It had no Node prerequisite and buried the frontend setup inside "your first
   mission", so a frontend-only person met it after everything else.
3. It told people to **squash-merge**, which is the opposite of what `CLAUDE.md`
   says. That one is worth noting: two documents, one rule, no test.
4. Its "first mission" section pointed Dana at 9.8, which is merged, and did not
   mention that 9.13–9.17 landed.

Also added the things that actually bite on a fresh Windows machine: that the
venv has to be activated in **every** terminal, that `alembic upgrade head` is a
reflex after `git pull`, and that `studentwise_test` exists so a test run can
never eat your demo data.

**`README.md`** gained the frontend to its setup block, the demo login, a
Testing section, and the missing commands (`npm test`, `gen:api`, the roadmap
sync check).

**`CLAUDE.md`** gained a "Start here" table — which of the six documents to read
in what order, plus a thirty-second version of the whole project — and a
first-time-on-a-new-machine command sequence. It is the rulebook and it now says
so explicitly, rather than being the file people land in when looking for a
tutorial.

**`docs/roadmap.md` + `.html`** were three weeks of drift behind: 60 endpoints,
646 backend tests and 148 frontend tests when the real figures are 62, 672 and
253; a scoreboard totalling 44 done when the mission rows totalled 54; and an
"honest read" still claiming Epic 9 had *twelve missions, none started* when it
is 14 of 17 and the app runs end to end in two languages. Mission **0.8** is
added for this work, and the two-week plan was rewritten — its week one was
mostly things that shipped.

## Decisions

**The demo groups are documented as fixtures, not as sample data.** The useful
sentence about Florentin 22 is not "a third flat" but "the main account is not
in it, so if it appears in the group list the endpoint is returning the table".
Written that way each group earns its place, and a reader knows which one to
open when a specific thing looks wrong.

**One page owns the demo world; the others link to it.** `README.md`,
`CLAUDE.md`, `onboarding.md` and `frontend/README.md` were each restating a
third of it, which is exactly how the three-users claim survived so long. Now
they each say the one line a reader needs — sign in as `gal@studentwise.dev` —
and point at `testing.md` for the rest.

**`CLAUDE.md` gets a rule that `seed.py` and `testing.md` change together.** It
is the same class of rule as "every schema change gets a migration", without a
script to enforce it. Worth writing down even unenforced, since the failure has
already happened once.

## What surprised us

**The onboarding doc and the rulebook disagreed about merges** and had done for
some time. Nothing catches that. `alembic check` catches a model without a
migration, `check-roadmap-sync.mjs` catches a stale status page, the `contract`
job catches a stale client — and two prose documents contradicting each other
about a workflow rule sails through all three. Not obviously worth a script, but
worth knowing it is the one kind of drift here that has no alarm on it.

**The suite takes four and a half minutes, not ninety seconds.** Every document
that mentioned a runtime said "roughly 90 seconds", and the measured figure is
**672 passed in 262.93s**. Nobody had timed it since the number was written; it
was copied forward three times, including by this session before it was checked.

The useful half of that measurement: **298 of the 672 are `tests/unit`, and they
run in 0.57 seconds** because nothing in them touches a database. That is the
working loop, and it was not written down anywhere — so the docs now say run
`pytest tests/unit -q` while you work and the full suite before you push, rather
than implying a four-minute wait is the only option.

**The roadmap's scoreboard had drifted from its own mission rows** — 44 against
54 — inside the file the sync script guards. The script compares `roadmap.md`
against `roadmap.html` mission by mission and checks the headline figure on the
page; it has nothing to say about a hand-written summary table two hundred lines
above the rows it summarises. A file can be in sync with its published copy and
still disagree with itself.

## What's next

- **0.5, still.** Every one of these documents is written for two people who
  cannot yet clone the repo.
- When they can, the real test of this session is whether either of them gets
  from clone to running app without asking a question. Anything they do have to
  ask goes back into the file where they looked for it.
- Wire `node scripts/check-roadmap-sync.mjs` into CI. It is currently a command
  somebody has to remember, which is the thing it exists to stop being true.
