# 2026-10-06 — Deployment (Epic 10: 10.2-10.6)

Built on `feat/deployment`, on top of the AI chat (`bcc649c`). How to run it
lives in [`docs/deployment.md`](../deployment.md); this page is why it looks the
way it does.

## What was built

- **One Docker image** (repo-root `Dockerfile`): Node builds `frontend/dist`, a
  slim Python 3.12 image runs uvicorn as a non-root user, migrates on start, and
  serves the API *and* the frontend.
- **`render.yaml`**: one free web service in Frankfurt, deploying `main` only
  after CI passes (`autoDeployTrigger: checksPass`). Postgres is **Neon**, also
  Frankfurt.
- **Production mode** (`ENVIRONMENT=production`, `app/config.py`): refuses to
  start on the committed JWT secret, a short secret, a malformed Fernet key,
  Gmail without an encryption key, a wildcard or plain-http CORS origin, or a
  Gmail redirect pointing at a laptop -- and lists every problem at once,
  without echoing any value.
- **Neon's URL pasted as-is**: `postgres://` / `postgresql://` become
  `postgresql+psycopg://`; `sslmode=require` is kept.
- **Receipts in Postgres** (`receipt_images`, `RECEIPT_STORAGE=database`, the
  production default) behind the existing store interface.
- **Security headers** on every response; a CSP on the app shell whose script
  hash is computed from the built `index.html`; HSTS in production; cache
  headers that keep phones off stale service workers.
- **`seed.py` guard**: wipes a non-local database only when its host is named.
- **`make_readonly_role.py`**: the read-only Postgres role Ask and the chat run their generated SQL as (suggested in review by the coordinating session). Verified by connecting as the role.
- **`make_secrets.py`**, a CI `image` job that builds and boots the image, and
  the runbook.

## Decisions and why

- **Same origin, not Vercel + Render.** The frontend already calls `/api` on its
  own host and the service worker caches by that path. Serving both from one
  image removes CORS, a second deploy, and a second URL to register with
  Google. It also covers 10.4.
- **The frontend is the router's fallback, not a catch-all route.**
  `app.router.default` only runs when no route matched, so a router added
  anywhere in `main.py` can never be shadowed. A catch-all would have had to
  stay last by convention, and the failure -- a new feature's GETs answering 404
  in production only -- would have passed every test. Raised by the merge
  coordinator session; a test now adds a route after the frontend and checks it
  wins.
- **Receipts in Postgres rather than a bucket.** Render's free disk is wiped on
  every deploy and spin-down. Postgres needs no second account or SDK, and the
  `ON DELETE CASCADE` means deleting an expense takes its photo in the same
  statement. The store runs in its own transaction, like a bucket would, so the
  expense service did not change.
- **Neon, not Render Postgres:** Render's free database is deleted after 30 days.
- **Migrations on start**, because Render's pre-deploy command is paid-only.
- **`/docs` stays on**; rate limiting is not done (a known gap, written down).

## What surprised us

- pydantic's validation error echoes **every input value**, so the first version
  of "refuse to start" would have printed the database password and Anthropic
  key into the deploy log. `hide_input_in_errors=True`, with a test that fails
  without it.
- The catch-all answered HEAD with 405 -- uptime monitors read that as "down".
- Writing files with Python's `write_text` on Windows produces CRLF.
- The AI chat's first question goes in the create-conversation request, not
  `/messages`.

## Verified

- 1130 backend tests (the receipt API suite runs against both stores), 346
  frontend tests, lint, types, build, `alembic check`, the contract job.
- The production image against an SSL-only Postgres (TLS 1.3 confirmed), driven
  in Edge: sign-in, deep-link reload, fonts, service worker, receipt upload,
  **the receipt surviving the container being destroyed and recreated**, Ask
  and Chat against the real model -- no console errors or CSP violations.
- faiss-cpu (coming with 8.3) in the same image: 213 MB peak, under Render's
  512 MB.

## Next

Go live: Neon project, seed it, Render Blueprint (needs the repo owner to grant
Render access), then tick 10.2-10.6 in the roadmap.
