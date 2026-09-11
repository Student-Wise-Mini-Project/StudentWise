import { createContext, use } from 'react'

import { translate } from './format'
import { catalogues, type MessageKey } from './messages'
import type { Locale, Vars } from './types'

export type I18nState = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, vars?: Vars) => string
}

/**
 * In its own file so `I18nProvider.tsx` exports only a component and fast
 * refresh keeps working -- the same reason `authContext.ts` is split out.
 *
 * The default is a real English state rather than `null`, which is the one
 * place this deliberately differs from `useAuth`. Screen tests render a screen
 * without any provider and assert on English copy; making them all wrap would
 * be churn for no signal, and the app's single provider is covered by
 * `routes.test.tsx`. A forgotten provider shows English, not a crash.
 */
const DEFAULT: I18nState = {
  locale: 'en',
  setLocale: () => {},
  t: (key, vars) => translate(catalogues.en, key, vars, 'en'),
}

export const I18nContext = createContext<I18nState>(DEFAULT)

export function useI18n(): I18nState {
  return use(I18nContext)
}

/** The hook screens use. `const t = useT()`, then `t('groups.list.title')`. */
export function useT(): I18nState['t'] {
  return use(I18nContext).t
}

export function useLocale(): { locale: Locale; setLocale: (locale: Locale) => void } {
  const { locale, setLocale } = use(I18nContext)
  return { locale, setLocale }
}
