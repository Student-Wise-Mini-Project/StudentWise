/**
 * Where the access token lives.
 *
 * Source of truth is a module-level variable, read synchronously by the request
 * middleware -- no React state on the hot path, so a token change never depends
 * on a render having happened.
 *
 * `localStorage` is the mirror, and that is a deliberate trade-off rather than a
 * default. The alternatives:
 *
 *   - `sessionStorage` signs you out every time the PWA is relaunched from the
 *     iOS home screen, which is the main way this app is meant to be opened.
 *   - An httpOnly cookie is not on the table: the API is Bearer-only.
 *   - Memory-only means re-logging in on every refresh.
 *
 * The cost is that any XSS on this origin can read the token. That is mitigated
 * by a lint rule banning `dangerouslySetInnerHTML`, by the token expiring within
 * a week, and by nothing else on the origin executing user-supplied HTML. It is
 * a known, bounded risk -- not an oversight.
 */
const TOKEN_KEY = 'sw.token'
const USER_ID_KEY = 'sw.userId'

let token: string | null = null

/** Read once, before the first render, so the middleware never sees a stale null. */
export function hydrateToken(): string | null {
  try {
    token = window.localStorage.getItem(TOKEN_KEY)
  } catch {
    // Safari in private mode throws on access. An unauthenticated app is a
    // correct outcome here; a crashed app is not.
    token = null
  }
  return token
}

export function getToken(): string | null {
  return token
}

export function setToken(next: string | null): void {
  token = next
  try {
    if (next === null) window.localStorage.removeItem(TOKEN_KEY)
    else window.localStorage.setItem(TOKEN_KEY, next)
  } catch {
    // Keep the in-memory token: the session still works for this tab.
  }
}

/**
 * The last signed-in user, remembered only so a *different* person signing in on
 * the same device can have the cached API responses wiped. Cached reads sit in
 * Cache Storage unencrypted; on a shared laptop that is somebody else's expenses.
 */
export function getLastUserId(): string | null {
  try {
    return window.localStorage.getItem(USER_ID_KEY)
  } catch {
    return null
  }
}

export function setLastUserId(id: string | null): void {
  try {
    if (id === null) window.localStorage.removeItem(USER_ID_KEY)
    else window.localStorage.setItem(USER_ID_KEY, id)
  } catch {
    /* ignore */
  }
}

/** Signing out in one tab signs out the others. */
export function watchOtherTabs(onChange: (token: string | null) => void): () => void {
  const handler = (event: StorageEvent) => {
    if (event.key !== TOKEN_KEY) return
    token = event.newValue
    onChange(token)
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}
