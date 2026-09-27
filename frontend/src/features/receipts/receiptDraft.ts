import type { ExpenseCategory, ItemIn, ReceiptScan } from '@/api/types'
import { addAll, compare, isPositive, isValidAmount, subtract } from '@/lib/money'

/**
 * A scanned receipt while a person checks and splits it.
 *
 * Everything here adds and subtracts; nothing divides. Who owes what is asked of
 * the server (`useItemPreview`), because the client never splits money.
 */
export type DraftLine = {
  /** Stable across edits, so React keeps each row's input focus. */
  key: string
  name: string
  amount: string
  /** Who shared this line. Empty means everyone in the group. */
  userIds: string[]
}

export type ReceiptDraft = {
  title: string
  total: string
  date: string
  payerId: string
  category: ExpenseCategory | ''
  lines: DraftLine[]
}

let nextKey = 0
export function newLineKey(): string {
  nextKey += 1
  return `line-${nextKey}`
}

export function draftFromScan(
  scan: ReceiptScan,
  defaults: { payerId: string; today: string; fallbackTitle: string },
): ReceiptDraft {
  const title = scan.merchant ?? defaults.fallbackTitle
  const lines = scan.lines.map((line) => ({
    key: newLineKey(),
    name: line.name,
    amount: line.amount,
    userIds: [],
  }))
  return {
    title,
    total: scan.total_amount,
    date: scan.expense_date ?? defaults.today,
    payerId: defaults.payerId,
    category: scan.category ?? '',
    // A receipt with a total and no legible lines is still worth saving. One
    // line for the whole amount keeps the split step working: assign it to
    // whoever shared it, or leave it for everyone.
    lines:
      lines.length > 0
        ? lines
        : [{ key: newLineKey(), name: title, amount: scan.total_amount, userIds: [] }],
  }
}

function amountOk(value: string): boolean {
  return isValidAmount(value) && isPositive(value)
}

export function linesTotal(draft: ReceiptDraft): string {
  return addAll(draft.lines.map((line) => (isValidAmount(line.amount) ? line.amount : '0')))
}

/**
 * The receipt total minus the lines. Negative is a discount, positive a service
 * charge or a line that was not read; either way it is shared in proportion to
 * what each person's lines came to. Null while the total is not a number.
 */
export function gap(draft: ReceiptDraft): string | null {
  if (!isValidAmount(draft.total)) return null
  return subtract(draft.total, linesTotal(draft))
}

export type Problem = 'title' | 'total' | 'payer' | 'date' | 'noLines' | 'lineName' | 'lineAmount'

/** What still stops the draft from being saved, in the order the form shows it. */
export function problems(draft: ReceiptDraft): Problem[] {
  const found: Problem[] = []
  if (draft.title.trim() === '') found.push('title')
  if (!amountOk(draft.total)) found.push('total')
  if (draft.payerId === '') found.push('payer')
  if (draft.date === '') found.push('date')
  if (draft.lines.length === 0) found.push('noLines')
  if (draft.lines.some((line) => line.name.trim() === '')) found.push('lineName')
  if (draft.lines.some((line) => !amountOk(line.amount))) found.push('lineAmount')
  return found
}

export function toggleUser(line: DraftLine, userId: string): DraftLine {
  const on = line.userIds.includes(userId)
  return {
    ...line,
    userIds: on ? line.userIds.filter((id) => id !== userId) : [...line.userIds, userId],
  }
}

/** The lines as the API takes them. An empty `user_ids` means everyone. */
export function toItems(draft: ReceiptDraft): ItemIn[] {
  return draft.lines.map((line) => ({
    name: line.name.trim(),
    amount: line.amount,
    user_ids: line.userIds,
  }))
}

/** Did the person change what was read? Kept with the expense, as evidence of how good the reading was. */
export function wasEdited(draft: ReceiptDraft, scan: ReceiptScan): boolean {
  const read = scan.lines.map((line) => `${line.name}|${line.amount}`).join('\n')
  const now = draft.lines.map((line) => `${line.name.trim()}|${line.amount}`).join('\n')
  return (
    read !== now ||
    compare(draft.total, scan.total_amount) !== 0 ||
    draft.title.trim() !== (scan.merchant ?? '') ||
    draft.date !== (scan.expense_date ?? '') ||
    draft.category !== (scan.category ?? '')
  )
}
