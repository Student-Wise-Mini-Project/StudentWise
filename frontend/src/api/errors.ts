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
export function detailOf(error: unknown, fallback = 'Something went wrong.'): string {
  if (isApiError(error)) return error.detail || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
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
          return field ? `${String(field)}: ${item.msg ?? 'is invalid'}` : (item.msg ?? '')
        })
        .filter(Boolean)
      if (messages.length) return messages.join('. ')
    }
  }
  return defaultForStatus(status)
}

function defaultForStatus(status: number): string {
  switch (status) {
    case 401:
      return 'Your session has expired. Please sign in again.'
    case 403:
      return 'You do not have access to that.'
    case 404:
      return 'That does not exist.'
    case 409:
      return 'That conflicts with something that already exists.'
    case 503:
      return 'That feature is not available on this server.'
    default:
      return status >= 500 ? 'The server had a problem. Try again.' : 'Something went wrong.'
  }
}
