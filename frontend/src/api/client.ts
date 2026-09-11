import createClient, { type Middleware } from 'openapi-fetch'

import { getToken } from '@/features/auth/authStore'
import { env } from '@/lib/env'

import { emitUnauthorized } from './authEvents'
import { ApiError, parseDetail } from './errors'
import type { paths } from './schema'

/**
 * A 401 from these two means "wrong password", not "your session died". Sending
 * the app to the login screen while the user is already on it -- and wiping the
 * inline error that explains what went wrong -- is worse than useless.
 */
const LOGIN_PATHS = ['/api/auth/login', '/api/auth/register']

const authMiddleware: Middleware = {
  onRequest({ request }) {
    const token = getToken()
    if (token) request.headers.set('Authorization', `Bearer ${token}`)
    return request
  },
}

const unauthorizedMiddleware: Middleware = {
  onResponse({ request, response }) {
    if (response.status !== 401) return response
    const url = new URL(request.url)
    if (LOGIN_PATHS.some((path) => url.pathname.endsWith(path))) return response
    emitUnauthorized()
    return response
  },
}

export const api = createClient<paths>({ baseUrl: env.API_URL })
api.use(authMiddleware)
api.use(unauthorizedMiddleware)

/**
 * Turn openapi-fetch's `{ data, error }` into `data`, or throw.
 *
 * Every hook in the app goes through this. It is what lets TanStack Query's
 * `error` path be uniform and lets one component render `{"detail": "..."}`
 * everywhere, instead of each hook unpacking the same shape again.
 */
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await call
  if (error !== undefined || !response.ok) {
    throw new ApiError(response.status, parseDetail(error, response.status), error)
  }
  // A 204 has no body; callers that expect nothing get undefined, which is
  // correct, and callers that expect something have already failed above.
  return data as T
}
