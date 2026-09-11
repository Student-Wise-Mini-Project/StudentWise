import { describe, expect, it } from 'vitest'

import { remainderFor, validateSplit, type ParticipantDraft } from './splitValidation'

const people = (...values: string[]): ParticipantDraft[] =>
  values.map((shareValue, index) => ({ userId: `u${index + 1}`, shareValue }))

describe('EQUAL', () => {
  it('is always valid, because there is nothing for the user to get wrong', () => {
    // The server allocates the cents with largest-remainder. The client does not
    // know the answer and must not pretend to.
    expect(validateSplit('EQUAL', people('', '', ''), '100.00').valid).toBe(true)
  })
})

describe('EXACT', () => {
  it('accepts only an exact match to the cent', () => {
    expect(validateSplit('EXACT', people('33.34', '33.33', '33.33'), '100.00').valid).toBe(true)
  })

  it('rejects the classic 99.99', () => {
    // Three thirds of 100 naively rounded. This is the case the backend's
    // largest-remainder method exists to prevent, and the case a user will
    // produce by hand within a week of using the app.
    const result = validateSplit('EXACT', people('33.33', '33.33', '33.33'), '100.00')
    expect(result.valid).toBe(false)
    expect(result.remaining).toBe('0.01')
    expect(result.messageVars?.amount).toBe('0.01')
  })

  it('says so when the parts overshoot, rather than showing a negative', () => {
    const result = validateSplit('EXACT', people('60.00', '50.00'), '100.00')
    expect(result.valid).toBe(false)
    expect(result.messageKey).toBe('expenses.split.overBy')
    expect(result.messageVars?.amount).toBe('10.00')
  })

  it('refuses text', () => {
    expect(validateSplit('EXACT', people('50.00', 'abc'), '100.00').valid).toBe(false)
  })
})

describe('PERCENTAGE', () => {
  it('accepts exactly 100', () => {
    expect(validateSplit('PERCENTAGE', people('38.9', '33.4', '27.7'), '6000.00').valid).toBe(true)
  })

  it('names the total when it is not 100', () => {
    const result = validateSplit('PERCENTAGE', people('33.33', '33.33', '33.33'), '100.00')
    expect(result.valid).toBe(false)
    expect(result.messageKey).toBe('expenses.split.percentSum')
    expect(result.messageVars?.sum).toBe('99.99')
  })

  it('does not care what the money total is', () => {
    expect(validateSplit('PERCENTAGE', people('50', '50'), '17.42').valid).toBe(true)
  })
})

describe('WEIGHT', () => {
  it('accepts any positive numbers', () => {
    expect(validateSplit('WEIGHT', people('2', '1', '1'), '100.00').valid).toBe(true)
    expect(validateSplit('WEIGHT', people('1.5', '0.5'), '100.00').valid).toBe(true)
  })

  it('rejects a zero or negative share', () => {
    expect(validateSplit('WEIGHT', people('2', '0'), '100.00').valid).toBe(false)
    expect(validateSplit('WEIGHT', people('2', '-1'), '100.00').valid).toBe(false)
  })
})

describe('nobody selected', () => {
  it('is never valid, whatever the split type', () => {
    for (const type of ['EQUAL', 'EXACT', 'PERCENTAGE', 'WEIGHT'] as const) {
      expect(validateSplit(type, [], '100.00').valid).toBe(false)
    }
  })
})

describe('remainderFor', () => {
  it('gives one person whatever the others have not taken', () => {
    const drafts = people('30.00', '25.00', '0.00')
    expect(remainderFor(drafts, 'u3', '100.00')).toBe('45.00')
  })

  it('can be negative, so the UI can say the total has been overshot', () => {
    expect(remainderFor(people('80.00', '50.00', '0'), 'u3', '100.00')).toBe('-30.00')
  })

  it('returns null rather than a wrong number when another field is not a number', () => {
    expect(remainderFor(people('30.00', 'abc', ''), 'u3', '100.00')).toBeNull()
  })
})

describe('before the total has been typed', () => {
  // The amount is a form field. Choosing "exact amounts" first and typing the
  // total afterwards is an ordinary order to do things in, and it used to throw
  // a DecimalError out of the render and blank the screen.
  it('asks for the total instead of crashing on EXACT', () => {
    const result = validateSplit('EXACT', people('', '', ''), '')
    expect(result.valid).toBe(false)
    expect(result.messageKey).toBe('expenses.split.totalFirst')
    expect(result.remaining).toBeNull()
  })

  it('offers no remainder when there is no total to take it from', () => {
    expect(remainderFor(people('30.00', '', ''), 'u3', '')).toBeNull()
  })

  it('still validates the modes that do not need a total', () => {
    // A percentage split is checked against 100, not against the amount, so an
    // empty total must not make it complain.
    expect(validateSplit('PERCENTAGE', people('50', '30', '20'), '').valid).toBe(true)
    expect(validateSplit('WEIGHT', people('1', '1', '2'), '').valid).toBe(true)
    expect(validateSplit('EQUAL', people('', '', ''), '').valid).toBe(true)
  })

  it('reads a trailing dot as the number it already is', () => {
    // Someone mid-keystroke has typed "12.", which is twelve. Refusing it would
    // make the remainder hint flicker away under their fingers between the dot
    // and the first decimal digit.
    expect(remainderFor(people('5.00', '', ''), 'u3', '12.')).toBe('7.00')
    expect(validateSplit('EXACT', people('12.', '', ''), '12.00').valid).toBe(true)
  })
})
