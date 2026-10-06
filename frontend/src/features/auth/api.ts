import { api, unwrap } from '@/api/client'
import { ApiError, parseDetail } from '@/api/errors'
import type { AuthResponse, User } from '@/api/types'
import { env } from '@/lib/env'

/**
 * Log in.
 *
 * **This endpoint is form-encoded, not JSON**, and the email goes in a field
 * called `username`. That is not a quirk of this client: the backend uses
 * FastAPI's `OAuth2PasswordRequestForm` so the Authorize button in `/docs` works,
 * and the field name comes from the OAuth2 spec. Sending JSON here gets a 422
 * that says nothing useful about why.
 *
 * Written with `fetch` rather than through the typed client because
 * `application/x-www-form-urlencoded` is the one place the generated types
 * describe a shape openapi-fetch will not serialise for us. The response is
 * still typed.
 */
export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${env.API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: email, password }),
  })

  const body: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    throw new ApiError(response.status, parseDetail(body, response.status), body)
  }
  return body as AuthResponse
}

export function register(input: {
  name: string
  email: string
  password: string
  phone_number?: string | null
}): Promise<AuthResponse> {
  return unwrap(api.POST('/api/auth/register', { body: input }))
}

export function fetchMe(signal?: AbortSignal): Promise<User> {
  return unwrap(api.GET('/api/auth/me', { signal }))
}

/** Set your phone number, or remove it with null. The server normalises it. */
export function updatePhoneNumber(phoneNumber: string | null): Promise<User> {
  return unwrap(api.PATCH('/api/users/me', { body: { phone_number: phoneNumber } }))
}
