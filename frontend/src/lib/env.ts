/**
 * Typed access to build-time configuration.
 *
 * `API_URL` is empty by default, which means "same origin". In development Vite
 * proxies `/api` to the backend on :8000, so the app is genuinely same-origin
 * and the service worker's `/api/**` caching rules behave exactly as they will
 * in production. Set `VITE_API_URL` only when the API is on another host.
 */
export const env = {
  API_URL: (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, ''),
  DEV: import.meta.env.DEV,
} as const
