import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'

import { applyLocale, readStoredLocale } from '@/lib/prefs'

import { translate } from './format'
import { I18nContext, type I18nState } from './i18nContext'
import { catalogues, type MessageKey } from './messages'
import type { Locale, Vars } from './types'

/**
 * The language, for the whole app.
 *
 * `locale` is a prop only so tests can pin one; the app passes nothing and the
 * stored preference wins.
 */
export function I18nProvider({ children, locale: fixed }: { children: ReactNode; locale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(fixed ?? readStoredLocale)

  useEffect(() => {
    applyLocale(locale)
  }, [locale])

  const setLocale = useCallback((next: Locale) => setLocaleState(next), [])

  const value = useMemo<I18nState>(
    () => ({
      locale,
      setLocale,
      t: (key: MessageKey, vars?: Vars) => translate(catalogues[locale], key, vars, locale),
    }),
    [locale, setLocale],
  )

  // Keyed on the locale so a switch remounts the tree. Components that format a
  // date or an amount but never call `useT` would otherwise keep the previous
  // language until something else re-rendered them.
  return (
    <I18nContext value={value}>
      <div key={locale} className="contents">
        {children}
      </div>
    </I18nContext>
  )
}
