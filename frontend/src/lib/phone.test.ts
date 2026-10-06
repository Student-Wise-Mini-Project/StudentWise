import { describe, expect, it } from 'vitest'

import { formatPhone, phoneProblem } from './phone'

// The same cases as backend/tests/unit/test_phone.py: two implementations of
// one rule are only safe while they are checked against one list.
describe('phoneProblem', () => {
  it.each([
    '0501234567',
    '050-1234567',
    '050-123-4567',
    '050 123 4567',
    '(050) 123-4567',
    '050.123.4567',
    '+972501234567',
    '+972 50 123 4567',
    '+972-50-123-4567',
    '972501234567',
    '00972501234567',
    '+972 050 123 4567',
    '  0501234567  ',
  ])('accepts %s', (typed) => {
    expect(phoneProblem(typed)).toBeNull()
  })

  it.each(['050', '051', '052', '053', '054', '055', '058', '059'])(
    'accepts every mobile prefix (%s)',
    (prefix) => {
      expect(phoneProblem(`${prefix}7654321`)).toBeNull()
    },
  )

  it.each(['03-1234567', '02-6543210', '+972 3 123 4567', '077-1234567'])(
    'calls %s a landline, because Bit and PayBox need a mobile',
    (typed) => {
      expect(phoneProblem(typed)).toBe('landline')
    },
  )

  it.each(['050123456', '05012345678', '1501234567', '+1 415 555 0100', '+44 7700 900123', '972'])(
    'refuses %s',
    (typed) => {
      expect(phoneProblem(typed)).toBe('invalid')
    },
  )

  it('says when there are letters in it', () => {
    expect(phoneProblem('call me')).toBe('notDigits')
    expect(phoneProblem('050*1234567')).toBe('notDigits')
  })

  it('says when there is nothing in it', () => {
    expect(phoneProblem('   ')).toBe('empty')
  })
})

describe('formatPhone', () => {
  it('writes a stored number the way Israelis do', () => {
    expect(formatPhone('+972501234567')).toBe('050-123-4567')
    expect(formatPhone('+972587654321')).toBe('058-765-4321')
  })

  it('leaves anything else alone rather than mangling it', () => {
    expect(formatPhone('03-1234567')).toBe('03-1234567')
    expect(formatPhone('+14155550100')).toBe('+14155550100')
  })
})
