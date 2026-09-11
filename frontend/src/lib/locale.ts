import type { Locale } from '@/i18n/types'

/**
 * The locale, for code that is not a React component.
 *
 * `formatMoney` and `formatDay` are called from `charts.tsx` and from plain
 * helpers that never see a hook, so the locale cannot reach them through
 * context. It is a genuine application global -- it is stamped on `<html>` --
 * so a module-level value is honest rather than a shortcut.
 *
 * `I18nProvider` keys its subtree on the locale, so a switch remounts every
 * screen and nothing renders a date in the language it had a moment ago.
 */
let current: Locale = 'en'

export function currentLocale(): Locale {
  return current
}

export function setFormattingLocale(locale: Locale): void {
  current = locale
}
