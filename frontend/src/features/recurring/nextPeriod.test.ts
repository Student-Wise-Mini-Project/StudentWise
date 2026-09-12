import { describe, expect, it } from 'vitest'

import { onePeriodAfter } from './nextPeriod'

describe('onePeriodAfter', () => {
  it('steps a month', () => {
    expect(onePeriodAfter('2026-09-12', 'MONTHLY')).toBe('2026-10-12')
  })

  it('steps two months, a quarter and a year', () => {
    expect(onePeriodAfter('2026-09-12', 'EVERY_2_MONTHS')).toBe('2026-11-12')
    expect(onePeriodAfter('2026-09-12', 'QUARTERLY')).toBe('2026-12-12')
    expect(onePeriodAfter('2026-09-12', 'YEARLY')).toBe('2027-09-12')
  })

  it('rolls over the year end', () => {
    expect(onePeriodAfter('2026-12-05', 'MONTHLY')).toBe('2027-01-05')
  })

  it('clamps into a short month rather than sliding into the next one', () => {
    // The backend's clamp_to_month does the same. The 31st repeating on the
    // 1st of March would be a different bill.
    expect(onePeriodAfter('2026-01-31', 'MONTHLY')).toBe('2026-02-28')
    expect(onePeriodAfter('2028-01-31', 'MONTHLY')).toBe('2028-02-29')
    expect(onePeriodAfter('2026-03-31', 'MONTHLY')).toBe('2026-04-30')
  })
})
