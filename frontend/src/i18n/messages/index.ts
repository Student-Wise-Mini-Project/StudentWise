import { isPluralForms } from '../format'
import type { FlatCatalogue, Flatten, Locale, Widen } from '../types'

import activityEn from './en/activity.json'
import analyticsEn from './en/analytics.json'
import authEn from './en/auth.json'
import balancesEn from './en/balances.json'
import commonEn from './en/common.json'
import errorsEn from './en/errors.json'
import expensesEn from './en/expenses.json'
import groupsEn from './en/groups.json'
import notificationsEn from './en/notifications.json'
import recurringEn from './en/recurring.json'
import settingsEn from './en/settings.json'
import activityHe from './he/activity.json'
import analyticsHe from './he/analytics.json'
import authHe from './he/auth.json'
import balancesHe from './he/balances.json'
import commonHe from './he/common.json'
import errorsHe from './he/errors.json'
import expensesHe from './he/expenses.json'
import groupsHe from './he/groups.json'
import notificationsHe from './he/notifications.json'
import recurringHe from './he/recurring.json'
import settingsHe from './he/settings.json'

/**
 * The English catalogue is the source of truth for keys.
 *
 * One file per feature area, for the reason CLAUDE.md rule 2 gives about the
 * backend: three people should not have to edit the same file to add a string
 * to three different screens.
 */
export const en = {
  activity: activityEn,
  analytics: analyticsEn,
  auth: authEn,
  balances: balancesEn,
  common: commonEn,
  errors: errorsEn,
  expenses: expensesEn,
  groups: groupsEn,
  notifications: notificationsEn,
  recurring: recurringEn,
  settings: settingsEn,
} as const

/**
 * `Widen<typeof en>` is what makes a forgotten Hebrew string a compile error --
 * the same key set as English, no fewer and no extras.
 */
export const he: Widen<typeof en> = {
  activity: activityHe,
  analytics: analyticsHe,
  auth: authHe,
  balances: balancesHe,
  common: commonHe,
  errors: errorsHe,
  expenses: expensesHe,
  groups: groupsHe,
  notifications: notificationsHe,
  recurring: recurringHe,
  settings: settingsHe,
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
