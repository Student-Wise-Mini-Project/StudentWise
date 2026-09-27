import type { DuplicatePair } from '@/api/types'
import type { MessageKey } from '@/i18n/messages'
import { compare } from '@/lib/money'

/**
 * Why a pair looks like one payment entered twice, as catalogue keys.
 *
 * The API also sends `reasons`, but as English sentences -- unreadable on the
 * Hebrew screen. Every fact they are built from is in the pair itself, so the
 * explanation is rebuilt here, in whichever language the app is showing.
 * Nothing is divided; amounts are only compared.
 */
export type Reason = { key: MessageKey; count?: number }

function sameTitle(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  return norm(a) === norm(b)
}

export function duplicateReasons(pair: DuplicatePair): Reason[] {
  const reasons: Reason[] = []
  reasons.push({
    key:
      compare(pair.first.total_amount, pair.second.total_amount) === 0
        ? 'analytics.alerts.sameAmount'
        : 'analytics.alerts.closeAmount',
  })
  reasons.push({
    key: sameTitle(pair.first.title, pair.second.title)
      ? 'analytics.alerts.sameTitle'
      : 'analytics.alerts.similarTitle',
  })
  reasons.push(
    pair.day_gap === 0
      ? { key: 'analytics.alerts.sameDay' }
      : { key: 'analytics.alerts.daysApart', count: pair.day_gap },
  )
  reasons.push({
    key: pair.same_payer ? 'analytics.alerts.samePayer' : 'analytics.alerts.differentPayers',
  })
  return reasons
}

/**
 * Is this Ask column an amount of money?
 *
 * The answer's columns are whatever the generated SQL named them, so the only
 * signal is the name. Money is shown as money, with the group's currency; a
 * percentage or a count must not be, so the words are specific rather than
 * "anything with two decimals".
 */
const MONEY_WORDS = /(amount|total|paid|spent|owed|cost|price|balance|sum|share|net)/i
const NOT_MONEY_WORDS = /(percent|pct|ratio|count|number|num_|_num|weight|times|days)/i

export function isMoneyColumn(column: string): boolean {
  return MONEY_WORDS.test(column) && !NOT_MONEY_WORDS.test(column)
}

/** A decimal string the API sends for money, e.g. "412.30" or "-12.5". */
export function looksLikeAmount(value: unknown): value is string {
  return typeof value === 'string' && /^-?\d+(\.\d{1,2})?$/.test(value)
}
