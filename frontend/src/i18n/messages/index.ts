import { isPluralForms } from '../format'
import type { FlatCatalogue, Flatten, Locale, Widen } from '../types'

import balancesEn from './en/balances.json'
import commonEn from './en/common.json'
import expensesEn from './en/expenses.json'
import groupsEn from './en/groups.json'
import balancesHe from './he/balances.json'
import commonHe from './he/common.json'
import expensesHe from './he/expenses.json'
import groupsHe from './he/groups.json'

/**
 * The English catalogue is the source of truth for keys.
 *
 * One file per feature area, for the reason CLAUDE.md rule 2 gives about the
 * backend: three people should not have to edit the same file to add a string
 * to three different screens.
 */
export const en = {
  balances: balancesEn,
  common: commonEn,
  expenses: expensesEn,
  groups: groupsEn,
} as const

/**
 * `Widen<typeof en>` is what makes a forgotten Hebrew string a compile error --
 * the same key set as English, no fewer and no extras.
 */
export const he: Widen<typeof en> = {
  balances: balancesHe,
  common: commonHe,
  expenses: expensesHe,
  groups: groupsHe,
}

export type MessageKey = Flatten<typeof en>

function flatten(source: object, prefix = '', out: FlatCatalogue = {}): FlatCatalogue {
  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string' || isPluralForms(value)) out[path] = value
    else flatten(value as object, path, out)
  }
  return out
}

/** Both catalogues, flattened once at module load. */
export const catalogues: Record<Locale, FlatCatalogue> = {
  en: flatten(en),
  he: flatten(he),
}
