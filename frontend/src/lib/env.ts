/**
 * Typed access to build-time configuration.
 *
 * `API_URL` must be **absolute**. That is not a style preference: `openapi-fetch`
 * builds a `new URL()` internally, and `new URL('/api/auth/me', '')` throws
 * `Invalid URL` -- so an empty base does not quietly fall back to a relative
 * request, it breaks every call in the app before one is ever sent.
 *
 * Unset means "same origin", which is resolved here rather than left empty. In
 * development Vite proxies `/api` to the backend on :8000, so the app really is
 * same-origin and the service worker's `/api/**` caching rules behave exactly as
 * they will in production. Set `VITE_API_URL` only when the API lives on another
 * host.
 */
const configured = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

function sameOrigin(): string {
  return typeof window === 'undefined' ? 'http://localhost' : window.location.origin
}

export const env = {
  API_URL: configured || sameOrigin(),
  DEV: import.meta.env.DEV,
} as const
