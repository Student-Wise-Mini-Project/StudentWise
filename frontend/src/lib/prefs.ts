/**
 * Per-device preferences. Not per-account: the theme belongs to the phone, not
 * to whoever is signed in on it, so this is deliberately separate from the auth
 * store and survives signing out.
 */
export type Theme = 'system' | 'light' | 'dark'

const THEME_KEY = 'sw.theme'

export function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_KEY)
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(theme: Theme): void {
  // "system" means no stamp at all, so `prefers-color-scheme` decides. See the
  // three-state comment in theme.css.
  if (theme === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme

  try {
    window.localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* A browser blocking site data is not a reason to fail. */
  }
}

const IOS_HINT_KEY = 'sw.iosInstallHintDismissed'

/** Whether the "Add to Home Screen" hint has already been dismissed. */
export function iosHintDismissed(): boolean {
  try {
    return window.localStorage.getItem(IOS_HINT_KEY) === '1'
  } catch {
    // A browser blocking site data just means the hint shows again.
    return false
  }
}

export function dismissIosHint(): void {
  try {
    window.localStorage.setItem(IOS_HINT_KEY, '1')
  } catch {
    /* ignore */
  }
}

const DEBUG_CONSOLE_KEY = 'sw.debugConsole'

/**
 * Whether the on-screen devtools panel should start.
 *
 * Per-device, like everything else here: it is a property of the phone you are
 * debugging on, not of the account signed in. Dev builds are the only thing
 * that reads it -- see `dev/mobileConsole.ts`.
 */
export function debugConsoleEnabled(): boolean {
  try {
    return window.localStorage.getItem(DEBUG_CONSOLE_KEY) === '1'
  } catch {
    return false
  }
}

export function setDebugConsole(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(DEBUG_CONSOLE_KEY, '1')
    else window.localStorage.removeItem(DEBUG_CONSOLE_KEY)
  } catch {
    /* ignore */
  }
}
