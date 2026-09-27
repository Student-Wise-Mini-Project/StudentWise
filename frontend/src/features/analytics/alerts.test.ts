import { describe, expect, it } from 'vitest'

import type { DuplicatePair } from '@/api/types'

import { duplicateReasons, isMoneyColumn, looksLikeAmount } from './alerts'

const side = (overrides: Partial<DuplicatePair['first']> = {}) => ({
  id: 'e1',
  title: 'Electricity bill',
  total_amount: '412.30',
  expense_date: '2026-09-01',
  category: 'UTILITIES' as const,
  payer: {
    id: 'u1',
    name: 'Maya',
    email: 'maya@studentwise.dev',
    phone_number: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  ...overrides,
})

function pair(overrides: Partial<DuplicatePair> = {}): DuplicatePair {
  return {
    score: '0.95',
    day_gap: 0,
    same_payer: true,
    reasons: [],
    first: side(),
    second: side({ id: 'e2' }),
    ...overrides,
  }
}

const keys = (p: DuplicatePair) => duplicateReasons(p).map((r) => r.key)

describe('why a pair looks like a double payment', () => {
  it('a double tap: same amount, same name, same day, same person', () => {
    expect(keys(pair())).toEqual([
      'analytics.alerts.sameAmount',
      'analytics.alerts.sameTitle',
      'analytics.alerts.sameDay',
      'analytics.alerts.samePayer',
    ])
  })

  it('a bill covered twice by two people, days apart, under another name', () => {
    const reasons = duplicateReasons(
      pair({
        day_gap: 2,
        same_payer: false,
        second: side({ id: 'e2', title: 'Electric bill', total_amount: '412.00' }),
      }),
    )
    expect(reasons).toEqual([
      { key: 'analytics.alerts.closeAmount' },
      { key: 'analytics.alerts.similarTitle' },
      { key: 'analytics.alerts.daysApart', count: 2 },
      { key: 'analytics.alerts.differentPayers' },
    ])
  })

  it('compares amounts as money, not as text', () => {
    expect(keys(pair({ second: side({ id: 'e2', total_amount: '412.3' }) }))[0]).toBe(
      'analytics.alerts.sameAmount',
    )
  })

  it('ignores case and spacing in names', () => {
    expect(keys(pair({ second: side({ id: 'e2', title: '  electricity   BILL ' }) }))[1]).toBe(
      'analytics.alerts.sameTitle',
    )
  })
})

describe('which Ask columns are money', () => {
  it.each(['total_paid', 'total_spent', 'amount', 'owed_amount', 'balance', 'net'])(
    '%s is money',
    (column) => expect(isMoneyColumn(column)).toBe(true),
  )

  it.each(['share_percent', 'expense_count', 'month', 'person', 'default_split_weight', 'days'])(
    '%s is not',
    (column) => expect(isMoneyColumn(column)).toBe(false),
  )

  it('only formats values that really are decimal amounts', () => {
    expect(looksLikeAmount('3757.40')).toBe(true)
    expect(looksLikeAmount('-12.5')).toBe(true)
    expect(looksLikeAmount('Maya')).toBe(false)
    expect(looksLikeAmount(42)).toBe(false)
    expect(looksLikeAmount('2026-03-01')).toBe(false)
  })
})
