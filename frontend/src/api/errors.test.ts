import { describe, expect, it } from 'vitest'

import { ApiError, detailOf, isApiError, parseDetail } from './errors'

describe('unpacking an API failure', () => {
  it('reads the documented {"detail": "..."} shape', () => {
    expect(parseDetail({ detail: 'Splits must sum to the total.' }, 400)).toBe(
      'Splits must sum to the total.',
    )
  })

  it('turns a 422 validation list into something a person can read', () => {
    // FastAPI answers validation failures with a list of per-field objects, not
    // a string. Rendering that straight gives "[object Object]" to the user.
    const body = {
      detail: [
        { loc: ['body', 'total_amount'], msg: 'Input should be greater than 0' },
        { loc: ['body', 'title'], msg: 'Field required' },
      ],
    }
    expect(parseDetail(body, 422)).toBe(
      'total_amount: Input should be greater than 0. title: Field required',
    )
  })

  it('falls back to something honest when there is no body at all', () => {
    expect(parseDetail(undefined, 403)).toBe('You do not have access to that.')
    expect(parseDetail(undefined, 404)).toBe('That does not exist.')
    expect(parseDetail(undefined, 500)).toBe('The server had a problem. Try again.')
    expect(parseDetail(undefined, 503)).toBe('That feature is not available on this server.')
  })

  it('does not crash on a body of the wrong shape', () => {
    expect(parseDetail('a string', 400)).toBeTruthy()
    expect(parseDetail({ detail: [] }, 422)).toBeTruthy()
    expect(parseDetail(null, 400)).toBeTruthy()
  })

  it('keeps the status and body on the error for callers that need them', () => {
    const error = new ApiError(409, 'Already a member.', { detail: 'Already a member.' })
    expect(isApiError(error)).toBe(true)
    expect(error.status).toBe(409)
    expect(detailOf(error)).toBe('Already a member.')
  })

  it('gives a fallback for a thrown value that is not an ApiError', () => {
    expect(detailOf(new TypeError('Failed to fetch'))).toBe('Failed to fetch')
    expect(detailOf(undefined)).toBe('Something went wrong.')
  })
})
