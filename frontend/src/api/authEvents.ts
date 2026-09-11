/**
 * A one-event emitter so `client.ts` can say "the token is dead" without
 * importing the router or the auth provider.
 *
 * Without this seam the API client would have to know about navigation, which
 * makes it untestable and creates an import cycle with the provider that uses
 * it.
 */
type Listener = () => void

const listeners = new Set<Listener>()

export function onUnauthorized(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitUnauthorized(): void {
  for (const listener of listeners) listener()
}
