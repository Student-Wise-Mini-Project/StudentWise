# StudentWise — frontend

Mobile-first PWA for the StudentWise API. React 19 + Vite + TypeScript +
Tailwind v4.

## Run it

The backend has to be up first — see the root `README.md`.

```powershell
docker compose up -d                       # from the repo root
cd backend; .\.venv\Scripts\Activate.ps1
python seed.py
uvicorn app.main:app --reload              # leave this running

cd ..\frontend
npm install
npm run gen:api                            # needs the backend running
npm run dev                                # http://localhost:5173
```

Sign in with `gal@studentwise.dev` / `password123`.

Vite proxies `/api` to `localhost:8000`, so the app is same-origin in
development and the service worker's caching rules behave exactly as they will
in production.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on 5173 |
| `npm run build` | Typecheck then production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run format` | Prettier |
| `npm run gen:api` | Regenerate `src/api/schema.d.ts` from the backend |

## Three rules that are enforced, not just documented

**1. Money is a string, and the client never divides it.**
Every amount arrives as `"33.34"`. `src/lib/money.ts` formats and validates; it
exposes nothing that splits a total between people. The API contract says
*"never re-derive splits on the client"* and it means it — the backend uses
largest-remainder rounding, and a second implementation in TypeScript would
disagree by a cent and make the balances screen argue with the expense list.
Where the UI must preview an equal split it shows `≈`, and `divideForDisplay()`
returns `{ value, approximate: true }` so the only thing you can render it with
is `<Money approximate/>`.

**2. Only `src/styles/` may name a colour or a typeface.**
`src/test/guards/design-tokens.test.ts` fails the build on a hex value, an
`rgb(`, a `font-family`, or a Tailwind arbitrary-colour class anywhere else.
That is what makes a redesign a one-file edit instead of a rewrite. The visual
direction is documented at the top of `src/styles/theme.css`, and the brief it
came from is `docs/design-brief.md`.

**3. No physical direction utilities.**
`ms-`/`me-`, not `ml-`/`mr-`. `text-start`, not `text-left`. The app is English
now and right-to-left Hebrew later; physical utilities survive a `dir` flip and
land the layout mirrored in exactly the wrong places. Nobody here is reading
Hebrew while building this, so a review will not catch it —
`src/test/guards/logical-props.test.ts` does.

## Types come from the backend

`src/api/schema.d.ts` is **generated** by `openapi-typescript` and committed. Do
not edit it. When the backend changes a response model, run `npm run gen:api`
and commit the result; the type checker will then point at every screen that
needs updating.

CI enforces this in the `contract` job, which regenerates the types straight
from `app.main` and fails on a diff. It is the frontend's `alembic check`: a
stale client is a build failure rather than a runtime 422 someone finds during
the demo.
