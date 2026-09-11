import { describe, expect, it } from 'vitest'

import { createIdempotencyTracker, stableHash } from './idempotency'

describe('idempotency key lifecycle', () => {
  it('reuses the key when the same body is retried', () => {
    // The whole point: a phone that sent rent, lost the reply and retries must
    // not pay rent twice.
    const tracker = createIdempotencyTracker()
    const body = { title: 'Rent', total_amount: '6000.00' }
    expect(tracker.keyFor(body)).toBe(tracker.keyFor(body))
  })

  it('does not care about key order in the body', () => {
    const tracker = createIdempotencyTracker()
    const first = tracker.keyFor({ title: 'Rent', total_amount: '6000.00' })
    const second = tracker.keyFor({ total_amount: '6000.00', title: 'Rent' })
    expect(second).toBe(first)
  })

  it('mints a new key when the user edits after a failure', () => {
    // Reusing a key with a different body is a 409, which would surface as a
    // baffling "conflict" on an innocent typo fix.
    const tracker = createIdempotencyTracker()
    const first = tracker.keyFor({ title: 'Rnt', total_amount: '6000.00' })
    const second = tracker.keyFor({ title: 'Rent', total_amount: '6000.00' })
    expect(second).not.toBe(first)
  })

  it('starts fresh after a success, so a second expense is a new intent', () => {
    const tracker = createIdempotencyTracker()
    const body = { title: 'Coffee', total_amount: '12.00' }
    const first = tracker.keyFor(body)
    tracker.consume()
    expect(tracker.keyFor(body)).not.toBe(first)
  })

  it('produces keys within the 200-character limit the API documents', () => {
    const tracker = createIdempotencyTracker()
    expect(tracker.keyFor({}).length).toBeLessThanOrEqual(200)
  })

  it('hashes nested objects stably too', () => {
    const a = stableHash({ participants: [{ user_id: 'u1', share_value: '2' }] })
    const b = stableHash({ participants: [{ share_value: '2', user_id: 'u1' }] })
    expect(a).toBe(b)
  })
})
