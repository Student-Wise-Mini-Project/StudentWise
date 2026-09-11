/**
 * Per-device preferences. Not per-account: the theme and the language belong to
 * the phone, not to whoever is signed in on it, so this is deliberately
 * separate from the auth store and survives signing out.
 */
import { LOCALES, type Locale } from '@/i18n/types'

import { setFormattingLocale } from './locale'

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

const LOCALE_KEY = 'sw.locale'

function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale)
}

/**
 * The stored language, or the one the device asks for.
 *
 * Falls back to Hebrew rather than English: the audience is Israeli students
 * paying in ₪ through Bit and PayBox, and a device set to anything else is far
 * more likely to be a Hebrew speaker on an English phone than the reverse.
 */
export function readStoredLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(LOCALE_KEY)
    if (isLocale(stored)) return stored
  } catch {
    /* A browser blocking site data still gets a language. */
  }
  return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'he'
}

/** Stamp the document, and remember. Mirrors `applyTheme` exactly. */
export function applyLocale(locale: Locale): void {
  document.documentElement.lang = locale
  document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr'
  setFormattingLocale(locale)

  try {
    window.localStorage.setItem(LOCALE_KEY, locale)
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
