import { describe, expect, it } from 'vitest'

import { catalogues } from './index'

/**
 * A language picker names each language in its own language, so `עברית` and
 * `English` are identical in both catalogues. That plus the product name are
 * the only places an untranslated string is correct.
 */
const IDENTICAL_BY_DESIGN = new Set([
  'common.appName',
  'settings.locales.he',
  'settings.locales.en',
  'settings.aboutApiTitle',
])

describe('catalogues', () => {
  it('flattens nested namespaces to dotted keys', () => {
    expect(catalogues.en['common.actions.cancel']).toBe('Cancel')
    expect(catalogues.he['common.actions.cancel']).toBe('ביטול')
  })

  it('has the same key set in both languages', () => {
    // The types already guarantee this. The test catches the case the types
    // cannot see: a key added to the flattened output by a bad merge.
    expect(Object.keys(catalogues.he).sort()).toEqual(Object.keys(catalogues.en).sort())
  })

  it('leaves no English string in the Hebrew catalogue', () => {
    const untranslated = Object.entries(catalogues.he)
      .filter(([key, value]) => !IDENTICAL_BY_DESIGN.has(key) && value === catalogues.en[key])
      .map(([key]) => key)
    expect(untranslated).toEqual([])
  })
})
