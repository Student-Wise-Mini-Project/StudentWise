import { describe, expect, it } from 'vitest'

import { translate } from '@/i18n/format'
import { catalogues, type MessageKey } from '@/i18n/messages'
import type { Locale, Vars } from '@/i18n/types'

import { categoryLabelOf, groupTypeLabel, splitTypeLabel } from './labels'

const tFor =
  (locale: Locale) =>
  (key: MessageKey, vars?: Vars): string =>
    translate(catalogues[locale], key, vars, locale)

describe('labels', () => {
  it('translates a group type', () => {
    expect(groupTypeLabel(tFor('en'), 'SHARED_APARTMENT')).toBe('Flat')
    expect(groupTypeLabel(tFor('he'), 'SHARED_APARTMENT')).toBe('דירה')
  })

  it('translates a split type', () => {
    expect(splitTypeLabel(tFor('he'), 'EQUAL')).toBe('שווה בשווה')
  })

  it('has a word for no category at all', () => {
    expect(categoryLabelOf(tFor('he'), null)).toBe('ללא קטגוריה')
    expect(categoryLabelOf(tFor('en'), null)).toBe('Uncategorised')
  })
})
