import { afterEach, describe, expect, it } from 'vitest'

import { formatDay, formatDayHeader, formatMonth } from './dates'
import { setFormattingLocale } from './locale'

describe('calendar dates never become instants', () => {
  it('formats a day as the day that was written', () => {
    // `new Date("2026-09-01")` is UTC midnight, which is 31 August anywhere west
    // of Greenwich. An expense entered on the 1st must not display as the 31st.
    expect(formatDay('2026-09-01')).toContain('1 Sep')
    expect(formatDay('2026-01-01')).toContain('1 Jan')
    expect(formatDay('2026-12-31')).toContain('31 Dec')
  })

  it('formats a month as the month that was written', () => {
    // `startsWith`, not equality: en-GB abbreviates September as "Sept", four
    // letters where every other month gets three. Pinning the exact string would
    // make this test a hostage to an ICU update rather than a check that the
    // month is the right one.
    expect(formatMonth('2026-09').startsWith('Sep')).toBe(true)
    expect(formatMonth('2026-01')).toBe('Jan')
    expect(formatMonth('2026-08')).toBe('Aug')
    expect(formatMonth('2026-12', 'long')).toBe('December 2026')
  })

  it('does not roll a month backwards across a timezone', () => {
    // The bug this guards: `new Date("2026-01")` is UTC midnight on 1 January,
    // which is 31 December anywhere west of Greenwich.
    expect(formatMonth('2026-01', 'long')).toBe('January 2026')
  })

  it('returns the input rather than "Invalid Date" for nonsense', () => {
    expect(formatDay('not-a-date')).toBe('not-a-date')
    expect(formatMonth('nope')).toBe('nope')
  })
})

describe('locale awareness', () => {
  afterEach(() => setFormattingLocale('en'))

  it('formats a day in Hebrew when the locale is Hebrew', () => {
    setFormattingLocale('he')
    // Not asserting the exact string: Intl's Hebrew month names are the
    // platform's business, not ours. What matters is that it is not English.
    expect(formatDay('2026-09-11')).not.toMatch(/Sep/)
  })

  it('says Today in the active language', () => {
    const now = new Date('2026-09-11T12:00:00Z')
    setFormattingLocale('he')
    expect(formatDayHeader('2026-09-11T10:00:00Z', now)).toBe('היום')
    setFormattingLocale('en')
    expect(formatDayHeader('2026-09-11T10:00:00Z', now)).toBe('Today')
  })
})
