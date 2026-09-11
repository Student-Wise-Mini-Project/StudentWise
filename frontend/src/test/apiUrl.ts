import { env } from '@/lib/env'

/**
 * Build an absolute URL for an MSW handler.
 *
 * MSW's wildcard path patterns do not match an absolute request URL here: the
 * handler is simply never used, the request escapes to the real network, and the
 * test fails with `ENOTFOUND` rather than anything that points at the pattern.
 * Absolute URLs built from the same `env.API_URL` the client uses cannot drift.
 */
export function apiUrl(path: string): string {
  return `${env.API_URL}${path}`
}
