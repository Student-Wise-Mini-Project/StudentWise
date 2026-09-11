/**
 * `Idempotency-Key` lifecycle for the two endpoints that accept one:
 * `POST /groups/{id}/expenses` and `POST /groups/{id}/settlements`.
 *
 * The backend's rules, which this exists to honour:
 *
 *   - same key, same body  -> 201 with the *first* request's resource
 *   - same key, DIFFERENT body -> 409
 *   - a request that failed -> the key is released, so retrying works
 *
 * The trap is the middle one. Someone taps Save on a train, the reply is lost,
 * they notice a typo in the title, fix it and tap Save again. Reusing the key
 * there is a 409 -- a baffling "conflict" on an innocent correction. So the key
 * is bound to a hash of the body that was sent with it, and changing the body
 * mints a new one. That makes the rule mechanical instead of something each form
 * has to remember.
 */

export function newKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  // Older WebViews. Uniqueness per user per endpoint is all the backend needs.
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** A stable hash of a request body: key order must not change the result. */
export function stableHash(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
      )
    }
    return item
  })
}

export type IdempotencyTracker = {
  /** The key to send with this body -- a new one if the body has changed. */
  keyFor: (body: unknown) => string
  /** Call after a 2xx. The next submit is a new intent and gets a new key. */
  consume: () => void
}

export function createIdempotencyTracker(): IdempotencyTracker {
  let key: string | null = null
  let hash: string | null = null

  return {
    keyFor(body) {
      const next = stableHash(body)
      if (key === null || hash !== next) {
        key = newKey()
        hash = next
      }
      return key
    },
    consume() {
      key = null
      hash = null
    },
  }
}
