import { describe, expect, it } from 'vitest'

import {
  addAll,
  allPositive,
  compare,
  divideForDisplay,
  formatMoney,
  isValidAmount,
  parseUserAmount,
  remaining,
  subtract,
  sumEquals,
  sumEqualsHundred,
} from './money'

describe('arithmetic is exact', () => {
  it('does not lose the cent that floats lose', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in IEEE 754. This is the entire reason
    // the API sends money as a string.
    expect(addAll(['0.10', '0.20'])).toBe('0.30')
    expect(subtract('0.30', '0.10')).toBe('0.20')
  })

  it('survives amounts a float would round', () => {
    expect(addAll(['4999999.99', '0.01'])).toBe('5000000.00')
    expect(subtract('1000000.10', '0.05')).toBe('1000000.05')
  })

  it('treats empty strings in a part list as zero', () => {
    expect(addAll(['10.00', '', '5.00'])).toBe('15.00')
  })

  it('compares without converting to a number', () => {
    expect(compare('33.34', '33.33')).toBe(1)
    expect(compare('33.33', '33.33')).toBe(0)
    expect(compare('-0.01', '0.00')).toBe(-1)
  })
})

describe('validation, which is not derivation', () => {
  it('accepts EXACT splits only when they hit the total to the cent', () => {
    expect(sumEquals(['33.34', '33.33', '33.33'], '100.00')).toBe(true)
    expect(sumEquals(['33.33', '33.33', '33.33'], '100.00')).toBe(false)
    expect(sumEquals(['50.00', '50.01'], '100.00')).toBe(false)
  })

  it('names what is left over so the UI can say it', () => {
    expect(remaining(['33.33', '33.33'], '100.00')).toBe('33.34')
    expect(remaining(['60.00', '50.00'], '100.00')).toBe('-10.00')
  })

  it('accepts PERCENTAGE splits only at exactly 100', () => {
    expect(sumEqualsHundred(['38.9', '33.4', '27.7'])).toBe(true)
    expect(sumEqualsHundred(['33.33', '33.33', '33.33'])).toBe(false)
  })

  it('requires every WEIGHT to be above zero', () => {
    expect(allPositive(['2', '1', '1'])).toBe(true)
    expect(allPositive(['2', '0'])).toBe(false)
    expect(allPositive(['2', '-1'])).toBe(false)
    expect(allPositive(['2', 'abc'])).toBe(false)
  })
})

describe('divideForDisplay is the only division, and it is fenced', () => {
  it('rounds down so the hint never promises more than the server gives', () => {
    // The server's largest-remainder result is 33.34 / 33.33 / 33.33. Showing
    // "33.34 each" would be a claim the app cannot keep for two of three people.
    expect(divideForDisplay('100.00', 3)).toEqual({ value: '33.33', approximate: true })
    expect(divideForDisplay('212.30', 3)).toEqual({ value: '70.76', approximate: true })
  })

  it('is exact when it divides evenly', () => {
    expect(divideForDisplay('90.00', 3)).toEqual({ value: '30.00', approximate: true })
  })

  it('refuses nonsense rather than returning NaN', () => {
    expect(divideForDisplay('100.00', 0)).toBeNull()
    expect(divideForDisplay('', 3)).toBeNull()
  })

  it('always carries the approximate marker, so <Money> must show the sign', () => {
    const share = divideForDisplay('100.00', 7)
    expect(share?.approximate).toBe(true)
  })
})

describe('parsing what a person typed', () => {
  it('accepts a comma as the decimal separator', () => {
    expect(parseUserAmount('212,30')).toBe('212.30')
  })

  it('strips currency symbols and spaces', () => {
    expect(parseUserAmount(' ₪ 89 ')).toBe('89.00')
  })

  it('reads a grouping separator as grouping, not as a decimal point', () => {
    // The bug this replaced: a naive "comma means decimal point" rule turned
    // "1,234.50" into "1.234.50", which parses as nothing, so the field emptied
    // itself under the fingers of somebody typing rent.
    expect(parseUserAmount('1,234.50')).toBe('1234.50')
    expect(parseUserAmount('1.234,50')).toBe('1234.50')
    expect(parseUserAmount('6,000')).toBe('6000.00')
    expect(parseUserAmount('6.000')).toBe('6000.00')
    expect(parseUserAmount('1,234,567.89')).toBe('1234567.89')
  })

  it('does not mistake a fraction for grouping when there is no leading group', () => {
    // No grouped number starts with a zero group, so "0.500" is half a shekel
    // and not five hundred of them.
    expect(parseUserAmount('0.500')).toBe('0.50')
    expect(parseUserAmount('0,750')).toBe('0.75')
  })

  it('still reads a comma as a decimal point when that is what it is', () => {
    expect(parseUserAmount('212,30')).toBe('212.30')
    expect(parseUserAmount('89,5')).toBe('89.50')
  })

  it('keeps a negative sign wherever it was typed', () => {
    expect(parseUserAmount('-280,10')).toBe('-280.10')
  })

  it('returns null for a half-typed value rather than clearing the field', () => {
    expect(parseUserAmount('')).toBeNull()
    expect(parseUserAmount('-')).toBeNull()
    expect(parseUserAmount('abc')).toBeNull()
  })

  it('knows what is a number and what is not', () => {
    expect(isValidAmount('0')).toBe(true)
    expect(isValidAmount('-12.5')).toBe(true)
    expect(isValidAmount('1.2.3')).toBe(false)
  })
})

describe('formatting', () => {
  it('formats the string exactly, with no float in the middle', () => {
    // Intl.NumberFormat accepts a string and formats it without a numeric
    // round-trip. If this ever stops being true, money on screen starts drifting
    // from money in the database -- so it is asserted rather than assumed.
    const formatted = formatMoney('9007199254740993.01', 'ILS')
    expect(formatted).toContain('9,007,199,254,740,993.01')
  })

  it('uses the shekel symbol for ILS', () => {
    expect(formatMoney('412.60', 'ILS')).toContain('₪')
    expect(formatMoney('412.60', 'ILS')).toContain('412.60')
  })

  it('shows no sign by default, because the label carries the meaning', () => {
    expect(formatMoney('-280.10', 'ILS')).not.toContain('-')
  })

  it('can show an explicit sign when the number stands alone', () => {
    expect(formatMoney('412.60', 'ILS', { sign: 'always' })).toContain('+')
    expect(formatMoney('-280.10', 'ILS', { sign: 'always' })).toMatch(/[-\u2212]/)
  })

  it('does not blank the screen on an unknown currency code', () => {
    expect(formatMoney('10.00', 'XYZ')).toContain('10.00')
  })
})
