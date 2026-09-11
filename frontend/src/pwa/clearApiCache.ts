/**
 * Delete the cached API responses.
 *
 * This is the unglamorous half of "the app works offline". `NetworkFirst` keeps
 * every authenticated GET in Cache Storage so the app opens with real data on a
 * bad connection -- which also means somebody's groups, expenses and balances
 * are sitting on disk, unencrypted, after they sign out. On a shared laptop the
 * next person could read them straight out of the cache.
 *
 * So: called on sign-out, and on sign-in when the user id differs from the last
 * one seen.
 *
 * Named caches only. Wiping every cache would take the app shell with it and
 * turn the next offline launch into a blank page.
 */
const API_CACHES = ['api-reads', 'api-receipts']

export async function clearApiCaches(): Promise<void> {
  if (typeof caches === 'undefined') return
  try {
    await Promise.all(API_CACHES.map((name) => caches.delete(name)))
  } catch {
    // Storage can be unavailable (private mode, a browser with site data
    // blocked). Failing to clear a cache must not block signing out.
  }
}
