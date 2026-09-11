import { describe, expect, it } from 'vitest'

import { interpolate, isPluralForms, selectPlural } from './format'

describe('interpolate', () => {
  it('fills a named placeholder', () => {
    expect(interpolate('Hello {name}', { name: 'Gal' })).toBe('Hello Gal')
  })

  it('fills the same placeholder more than once', () => {
    expect(interpolate('{a} and {a}', { a: 'x' })).toBe('x and x')
  })

  it('leaves an unknown placeholder alone rather than printing undefined', () => {
    expect(interpolate('Hello {name}', {})).toBe('Hello {name}')
  })

  it('coerces a number', () => {
    expect(interpolate('{count} left', { count: 3 })).toBe('3 left')
  })
})

describe('selectPlural', () => {
  const forms = { one: 'אחד', two: 'שניים', many: 'הרבה', other: '{count} אחרים' }

  it('picks the Hebrew two form, which English does not have', () => {
    expect(selectPlural(forms, 2, 'he')).toBe('שניים')
  })

  it('picks one for a single item', () => {
    expect(selectPlural(forms, 1, 'he')).toBe('אחד')
  })

  it('falls back to other when the selected category is absent', () => {
    expect(selectPlural({ one: 'one', other: '{count} other' }, 2, 'he')).toBe('{count} other')
  })

  it('English has no two category, so 2 is other', () => {
    expect(selectPlural({ one: 'one', other: '{count} other' }, 2, 'en')).toBe('{count} other')
  })
})

describe('isPluralForms', () => {
  it('recognises a plural object', () => {
    expect(isPluralForms({ one: 'a', other: 'b' })).toBe(true)
  })

  it('rejects a nested namespace', () => {
    expect(isPluralForms({ title: 'a', body: 'b' })).toBe(false)
  })

  it('rejects a string', () => {
    expect(isPluralForms('a')).toBe(false)
  })
})
