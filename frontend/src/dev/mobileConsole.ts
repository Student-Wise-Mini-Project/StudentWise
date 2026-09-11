/**
 * A devtools panel that runs inside the page, for debugging on a phone.
 *
 * Safari's Web Inspector is the only way to inspect an iOS page properly, and
 * it requires a Mac over USB. Every browser on iOS is WebKit underneath, so
 * installing Chrome does not help either. On a Windows machine there is no
 * remote inspector at all -- which leaves putting the console *in* the page.
 *
 * Off unless asked for. Add `?debug` to any URL to turn it on; it then survives
 * navigation and reloads, because a console that vanishes the moment you tap a
 * link is no use for following a bug across screens. `?debug=off` clears it.
 *
 * Dev only. `main.tsx` imports this behind `import.meta.env.DEV`, so the
 * dynamic import below sits in a branch Vite can prove is dead and eruda is not
 * in the production bundle at all -- verified by grepping `dist/`, not assumed.
 */

import { debugConsoleEnabled, setDebugConsole } from '@/lib/prefs'

/**
 * Decide from the URL, then fall back to what was asked for last time.
 *
 * The flag goes through `lib/prefs.ts` rather than touching `localStorage`
 * here, because storage access is confined to two files on purpose -- it is the
 * XSS surface for the access token, and the value of that rule is that grep
 * finds every user of it.
 *
 * `?debug=off` beats a remembered `on`, so there is always a way out from the
 * phone itself; otherwise turning it off would mean clearing site data.
 */
function wanted(): boolean {
  const param = new URLSearchParams(window.location.search).get('debug')

  if (param === 'off' || param === 'false' || param === '0') {
    setDebugConsole(false)
    return false
  }
  // `?debug` with no value parses as an empty string, which is still a request.
  if (param !== null) {
    setDebugConsole(true)
    return true
  }
  return debugConsoleEnabled()
}

export async function startMobileConsole(): Promise<void> {
  if (!wanted()) return

  const eruda = (await import('eruda')).default
  eruda.init({
    // The floating button is draggable and remembers where it was put, which
    // matters on a 390px screen where it will otherwise cover a form field.
    tool: ['console', 'network', 'elements', 'resources', 'info'],
    useShadowDom: true,
    autoScale: true,
  })

  // Unhandled rejections are the ones that matter here: a failed query or a
  // thrown render shows in the console, but a promise nobody awaited is
  // silently swallowed and looks like "the button did nothing".
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason)
  })

  console.info(
    '%cStudentWise debug console',
    'font-weight:bold',
    '\nAdd ?debug=off to any URL to turn this off.',
  )
}
