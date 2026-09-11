import { isPluralForms } from '../format'
import type { FlatCatalogue, Flatten, Locale, Widen } from '../types'

import commonEn from './en/common.json'
import commonHe from './he/common.json'

/**
 * The English catalogue is the source of truth for keys.
 *
 * One file per feature area, for the reason CLAUDE.md rule 2 gives about the
 * backend: three people should not have to edit the same file to add a string
 * to three different screens.
 */
export const en = {
  common: commonEn,
} as const

/**
 * `Widen<typeof en>` is what makes a forgotten Hebrew string a compile error --
 * the same key set as English, no fewer and no extras.
 */
export const he: Widen<typeof en> = {
  common: commonHe,
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
