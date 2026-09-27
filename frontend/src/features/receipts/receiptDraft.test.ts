import { describe, expect, it } from 'vitest'

import type { ReceiptScan } from '@/api/types'

import {
  type DraftLine,
  type ReceiptDraft,
  draftFromScan,
  gap,
  linesTotal,
  problems,
  toItems,
  toggleUser,
  wasEdited,
} from './receiptDraft'

const SCAN: ReceiptScan = {
  merchant: 'Shufersal',
  expense_date: '2026-09-20',
  total_amount: '54.00',
  currency: 'ILS',
  category: 'GROCERIES',
  lines: [
    { name: 'Milk', amount: '30.00' },
    { name: 'Wine', amount: '20.00' },
    { name: 'Hummus', amount: '10.00' },
  ],
  warnings: [],
  ai_metadata: {},
}

const DEFAULTS = { payerId: 'u-gal', today: '2026-09-27', fallbackTitle: 'Receipt' }

function lineAt(draft: ReceiptDraft, index: number): DraftLine {
  const line = draft.lines[index]
  if (!line) throw new Error(`no line ${index}`)
  return line
}

function withLine(
  draft: ReceiptDraft,
  index: number,
  change: (line: DraftLine) => DraftLine,
): ReceiptDraft {
  return { ...draft, lines: draft.lines.map((line, i) => (i === index ? change(line) : line)) }
}

describe('a draft from a scan', () => {
  it('takes what was read, with every line left for everyone', () => {
    const draft = draftFromScan(SCAN, DEFAULTS)
    expect(draft.title).toBe('Shufersal')
    expect(draft.total).toBe('54.00')
    expect(draft.date).toBe('2026-09-20')
    expect(draft.payerId).toBe('u-gal')
    expect(draft.lines.map((line) => [line.name, line.amount, line.userIds])).toEqual([
      ['Milk', '30.00', []],
      ['Wine', '20.00', []],
      ['Hummus', '10.00', []],
    ])
  })

  it('fills in what could not be read rather than leaving the form blank', () => {
    const draft = draftFromScan({ ...SCAN, merchant: null, expense_date: null }, DEFAULTS)
    expect(draft.title).toBe('Receipt')
    expect(draft.date).toBe('2026-09-27')
  })

  it('turns a receipt with no legible lines into one line for the whole total', () => {
    const draft = draftFromScan({ ...SCAN, lines: [] }, DEFAULTS)
    expect(draft.lines.map((line) => [line.name, line.amount])).toEqual([['Shufersal', '54.00']])
  })

  it('gives every line its own key', () => {
    const keys = draftFromScan(SCAN, DEFAULTS).lines.map((line) => line.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('the gap between the lines and the total', () => {
  it('is negative for a discount', () => {
    const draft = draftFromScan(SCAN, DEFAULTS)
    expect(linesTotal(draft)).toBe('60.00')
    expect(gap(draft)).toBe('-6.00')
  })

  it('is positive for a service charge', () => {
    expect(gap({ ...draftFromScan(SCAN, DEFAULTS), total: '66.00' })).toBe('6.00')
  })

  it('ignores a line that is still being typed', () => {
    const draft = withLine(draftFromScan(SCAN, DEFAULTS), 0, (line) => ({ ...line, amount: 'abc' }))
    expect(linesTotal(draft)).toBe('30.00')
  })

  it('is unknown while the total is not a number', () => {
    expect(gap({ ...draftFromScan(SCAN, DEFAULTS), total: '' })).toBeNull()
  })
})

describe('what stops a draft from being saved', () => {
  it('nothing, for a clean scan', () => {
    expect(problems(draftFromScan(SCAN, DEFAULTS))).toEqual([])
  })

  it('names each problem', () => {
    let draft = draftFromScan(SCAN, { ...DEFAULTS, payerId: '' })
    draft = { ...draft, title: '  ', total: '0' }
    draft = withLine(draft, 0, (line) => ({ ...line, name: '' }))
    draft = withLine(draft, 1, (line) => ({ ...line, amount: '-2.00' }))
    expect(problems(draft)).toEqual(['title', 'total', 'payer', 'lineName', 'lineAmount'])
  })

  it('needs at least one line', () => {
    expect(problems({ ...draftFromScan(SCAN, DEFAULTS), lines: [] })).toContain('noLines')
  })
})

describe('marking who shared a line', () => {
  it('toggles a person on and off', () => {
    const line = lineAt(draftFromScan(SCAN, DEFAULTS), 0)
    const on = toggleUser(line, 'u-maya')
    expect(on.userIds).toEqual(['u-maya'])
    expect(toggleUser(on, 'u-maya').userIds).toEqual([])
  })

  it('sends an unmarked line as everyone, and a marked one as exactly who', () => {
    const draft = withLine(draftFromScan(SCAN, DEFAULTS), 1, (line) => toggleUser(line, 'u-gal'))
    expect(toItems(draft)).toEqual([
      { name: 'Milk', amount: '30.00', user_ids: [] },
      { name: 'Wine', amount: '20.00', user_ids: ['u-gal'] },
      { name: 'Hummus', amount: '10.00', user_ids: [] },
    ])
  })
})

describe('whether the reading was corrected', () => {
  it('is false when the draft is exactly what was read', () => {
    expect(wasEdited(draftFromScan(SCAN, DEFAULTS), SCAN)).toBe(false)
  })

  it('is false when only the split changed -- that is not a correction', () => {
    const draft = withLine(draftFromScan(SCAN, DEFAULTS), 0, (line) => toggleUser(line, 'u-gal'))
    expect(wasEdited(draft, SCAN)).toBe(false)
  })

  it('is true when a line or the total was fixed', () => {
    const draft = withLine(draftFromScan(SCAN, DEFAULTS), 0, (line) => ({
      ...line,
      amount: '31.00',
    }))
    expect(wasEdited(draft, SCAN)).toBe(true)
    expect(wasEdited({ ...draftFromScan(SCAN, DEFAULTS), total: '55.00' }, SCAN)).toBe(true)
  })
})
