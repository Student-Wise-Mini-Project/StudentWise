# 8 October 2026 — merging the last branch, and checking the whole thing runs

The session before submission. No new features: the job was to establish that
`main` is the whole project, that it passes everything CI would run, and that
nothing was still waiting on a branch.

## What was merged

`feat/invites-and-fixes` — six commits — fast-forwarded into `main`. It was
already directly on top of `main`, so the merge kept all six mission commits
rather than squashing them, per the rule in `CLAUDE.md`.

It brought group invite links (backend, frontend, migration, 204 backend tests
+ 317 lines of frontend tests), plus three smaller fixes: back from an expense
opened in Alerts returns to Alerts, reminders go to one person at a time and
only to someone who owes you, and Gmail says plainly when its connection has
expired.

## What was deleted, and why it was safe

Every other branch is gone, locally and on `origin`. Nine remote branches had
already been deleted upstream and only survived as stale remote-tracking refs;
`git fetch --prune` cleared them.

`docs/final-report` was the one that needed checking before deleting, because
its two commits are not in `main`. It turned out to be an old snapshot: `main`
is about 10,000 lines *ahead* of it, no file on it is absent from `main`, and
`git diff main docs/final-report -- README.md docs/setup.md images/` is empty —
the report, the setup guide and all 28 screenshots are already on `main`,
having landed through the PR that closed Epic 11. Nothing was lost. The SHA was
`70dd1c6` if it is ever wanted back.

## The one thing that was actually broken

`npm run lint` and `npm run format:check` failed locally but passed in CI, and
the reason is worth writing down because it will happen again.

Two files are generated and gitignored: `frontend/openapi.json` (by
`npm run gen:api`) and `frontend/public/mockServiceWorker.js` (by `msw init`).
Prettier and eslint scan the *working tree*, not the index, and neither reads
`.gitignore` — so both tools found vendor code nobody committed. CI never
generates either file before linting, so CI stayed green while anyone who had
run `gen:api` once saw a failure they could not explain.

Fixed by naming both in `.prettierignore` and the eslint `ignores` list, and
the worker in `.gitignore` too. A gitignored file is not an ignored file.

## What was verified on `main`

Everything CI runs, plus the production image:

- backend: `ruff check`, `ruff format --check`, `alembic upgrade head`,
  `alembic check`, **1238 tests passing**
- frontend: `lint`, `format:check`, `typecheck`, **416 tests in 44 files**,
  `build`
- the `contract` job: the API types regenerated from `app.main` are identical
  to the committed `schema.d.ts`
- `node scripts/check-roadmap-sync.mjs`: in sync, 86 missions, 86 done
- the Docker image built and booted against Postgres, and passed all five
  assertions from CI's `image` job — `/health`, a 401 on `/api/auth/me`, the
  SPA served at `/groups`, and both the CSP and HSTS headers
- `/join/<token>` serves the SPA from the image, so an invite deep link works
  in production and not only under Vite's dev server

The invite flow was also exercised by hand against a seeded database: sharing
twice returns the same link, `renew` issues a new one and kills the old, stop
sharing revokes it, a non-member gets 403, an anonymous caller gets 401, and a
revoked token gets 404 — the same answer an unknown one gets.

## Surprises

**The repository has moved.** Every push prints:

```
remote: This repository moved. Please use the new location:
remote:   https://github.com/Student-Wise-Mini-Project/StudentWise.git
```

`origin` still points at `galharel23/StudentWise` and works through GitHub's
redirect, so nothing is broken — but the new URL is the one to put on anything
submitted. Repointing the remote is a one-liner nobody has run yet:

```powershell
git remote set-url origin https://github.com/Student-Wise-Mini-Project/StudentWise.git
```

**`/api/groups` returns a bare array**, not `Page[T]`, which reads like a
breach of hard rule 8. It predates this branch and the generated client and
`docs/api-contract.md` both agree with it, so it was left alone — changing the
shape the day before submission would break the frontend for no gain. Worth
settling deliberately later: either the rule gets an explicit exception for
this endpoint, or the endpoint gets paged.

## Where things stand

`main` is the only branch, locally and on `origin`, and it is the whole
project: 86 of 86 missions, every suite green, the production image verified.
Postgres is left running on 5434 with the demo world reseeded, so a demo needs
only `uvicorn app.main:app --reload` and `npm run dev`.
