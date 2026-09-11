import { catalogues } from '@/i18n/messages'
import { currentLocale } from '@/lib/locale'

/**
 * Resolve a catalogue key without a hook.
 *
 * These functions run inside the fetch layer, not inside a component, so they
 * read the locale from the module-level value that `applyLocale` keeps in step
 * with `<html lang>`.
 */
function message(key: string): string {
  return (catalogues[currentLocale()][key] as string | undefined) ?? key
}

/**
 * One error type for every failed request.
 *
 * The backend answers every failure with `{"detail": "..."}` -- that is a
 * documented guarantee, not an accident -- so there is exactly one shape to
 * unpack and exactly one component that renders it.
 */
export class ApiError extends Error {
  readonly status: number
  readonly detail: string
  readonly body: unknown

  constructor(status: number, detail: string, body?: unknown) {
    super(`${status}: ${detail}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.body = body
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/**
 * Pull a human-readable message out of whatever went wrong.
 *
 * 422 is the awkward one: FastAPI answers validation failures with a list of
 * per-field objects rather than a string, and rendering `[object Object]` at a
 * user is worse than saying nothing useful.
 */
export function detailOf(error: unknown, fallback?: string): string {
  // Resolved here rather than as a default parameter: the catalogue is read at
  // call time, so a language switch changes the next message rather than the
  // one baked in when the module loaded.
  const generic = fallback ?? message('errors.generic')
  if (isApiError(error)) return error.detail || generic
  if (error instanceof Error) return error.message || generic
  return generic
}

type ValidationItem = { loc?: unknown[]; msg?: string }

export function parseDetail(body: unknown, status: number): string {
  if (typeof body === 'object' && body !== null && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      const messages = (detail as ValidationItem[])
        .map((item) => {
          const field = Array.isArray(item.loc) ? item.loc.at(-1) : undefined
          const msg = item.msg ?? message('errors.fieldInvalid')
          return field ? `${String(field)}: ${msg}` : msg
        })
        .filter(Boolean)
      if (messages.length) return messages.join('. ')
    }
  }
  return defaultForStatus(status)
}

/**
 * The client's own words for a status the server sent no detail for.
 *
 * The server's `detail` still wins whenever there is one, even in Hebrew: an
 * unrecognised backend message reaching the user in English is a visible seam,
 * and better than a confident Hebrew sentence that says the wrong thing.
 */
const KNOWN_STATUSES = new Set([401, 403, 404, 409, 503])

function defaultForStatus(status: number): string {
  if (KNOWN_STATUSES.has(status)) return message(`errors.status.${status}`)
  return status >= 500 ? message('errors.status.500') : message('errors.generic')
}
