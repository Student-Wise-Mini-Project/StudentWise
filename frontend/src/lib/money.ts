import Decimal from 'decimal.js-light'

import type { Locale } from '@/i18n/types'

import { currentLocale } from './locale'

/**
 * Money, as the API speaks it: a decimal **string** like `"33.34"`.
 *
 * The rule this file exists to enforce, from `docs/api-contract.md`:
 *
 *   > Never re-derive splits on the client.
 *
 * The backend hands out cents using the largest-remainder method, so `100.00`
 * across three people is `33.34 / 33.33 / 33.33` and never `99.99`. A second
 * implementation of that rounding in TypeScript would eventually disagree by a
 * cent, and then the balances screen argues with the expense list and nobody can
 * tell which one is lying.
 *
 * So: this module formats, compares and **validates what the user typed**. The
 * one place it divides -- `divideForDisplay` -- returns a value the type system
 * will not let you render without an explicit `≈`.
 *
 * Nothing here ever returns a `number`. A `Decimal` never leaves the module, so
 * nothing downstream can accidentally `Number()` one.
 */

const ROUND_DOWN = 1 as const

function d(value: string | number): Decimal {
  return new Decimal(value)
}

/** True when a string is something we can do arithmetic on. */
export function isValidAmount(value: string): boolean {
  if (!/^-?\d*\.?\d*$/.test(value.trim()) || value.trim() === '' || value.trim() === '-') {
    return false
  }
  try {
    d(value.trim())
    return true
  } catch {
    return false
  }
}

/**
 * Normalise what someone typed into an amount the API will accept.
 *
 * Returns `null` when it is not a number yet -- which is different from zero,
 * and different from invalid, because a half-typed `"12."` should not clear the
 * field under the user's fingers.
 */
export function parseUserAmount(input: string): string | null {
  const stripped = input.replace(/[^\d.,-]/g, '')
  if (stripped === '' || stripped === '-') return null

  const negative = stripped.startsWith('-')
  const digits = stripped.replace(/-/g, '')
  const normalised = normaliseSeparators(digits)
  if (normalised === null || !isValidAmount(normalised)) return null

  return d(negative ? `-${normalised}` : normalised).toFixed(2)
}

/**
 * Work out which separator is the decimal point.
 *
 * People type amounts the way their keyboard and their schooling taught them:
 * `212.30`, `212,30`, `1,234.50` and `1.234,50` all mean something. Assuming a
 * comma is always a decimal point turns `1,234.50` into `1.234.50`, which parses
 * as nothing at all and silently empties the field while somebody is typing rent.
 *
 * The rule: whichever separator appears **last** is the decimal one, and every
 * other separator is grouping. A lone separator followed by exactly three digits
 * is grouping too (`1,234` is a thousand, not one-and-a-bit).
 */
function normaliseSeparators(value: string): string | null {
  const lastComma = value.lastIndexOf(',')
  const lastDot = value.lastIndexOf('.')

  if (lastComma === -1 && lastDot === -1) return value

  let decimalAt: number
  if (lastComma === -1) decimalAt = lastDot
  else if (lastDot === -1) decimalAt = lastComma
  else decimalAt = Math.max(lastComma, lastDot)

  const decimals = value.length - decimalAt - 1
  const onlyOneSeparator = value.replace(/[^.,]/g, '').length === 1

  // `1,234` and `1.234`: grouping, not a fractional part. But only where the
  // leading group could really be one -- `0.500` is half a shekel, not five
  // hundred, and no grouped number starts with a zero group.
  const leading = value.slice(0, decimalAt)
  const couldBeGrouped = /^[1-9]\d{0,2}$/.test(leading)
  if (onlyOneSeparator && decimals === 3 && couldBeGrouped) {
    return value.replace(/[.,]/g, '')
  }

  const whole = value.slice(0, decimalAt).replace(/[.,]/g, '')
  const fraction = value.slice(decimalAt + 1)
  if (/[.,]/.test(fraction)) return null
  return fraction === '' ? whole : `${whole}.${fraction}`
}

export function addAll(values: string[]): string {
  return values.reduce((total, value) => total.plus(d(value || '0')), d(0)).toFixed(2)
}

export function subtract(a: string, b: string): string {
  return d(a).minus(d(b)).toFixed(2)
}

export function negate(a: string): string {
  return d(a).neg().toFixed(2)
}

export function abs(a: string): string {
  return d(a).abs().toFixed(2)
}

/** -1, 0 or 1. */
export function compare(a: string, b: string): number {
  return d(a).cmp(d(b))
}

export function isZero(a: string): boolean {
  return d(a).isZero()
}

export function isPositive(a: string): boolean {
  return d(a).gt(0)
}

export function isNegative(a: string): boolean {
  return d(a).lt(0)
}

/* --- Validation. Checking what the user typed is not re-deriving anything. --- */

/** EXACT splits: the parts must add up to the total, to the cent. */
export function sumEquals(values: string[], total: string): boolean {
  return compare(addAll(values), total) === 0
}

/** PERCENTAGE splits: must land on 100, not near it. */
export function sumEqualsHundred(values: string[]): boolean {
  return compare(addAll(values), '100') === 0
}

/** WEIGHT splits: every weight has to be greater than zero. */
export function allPositive(values: string[]): boolean {
  return values.every((value) => isValidAmount(value) && isPositive(value))
}

/** What is left to allocate. Negative means the user has over-allocated. */
export function remaining(values: string[], total: string): string {
  return subtract(total, addAll(values))
}

/* --- The one division, fenced off by its return type. --------------------- */

/**
 * An equal share, **for display only**.
 *
 * Rounded down, so the hint never promises more than the server will give, and
 * returned wrapped so that the only thing which can render it is
 * `<Money approximate />`. The `≈` is enforced by the type system rather than by
 * somebody remembering.
 */
export type ApproximateAmount = { readonly value: string; readonly approximate: true }

export function divideForDisplay(total: string, people: number): ApproximateAmount | null {
  if (people <= 0 || !isValidAmount(total)) return null
  return { value: d(total).div(people).toFixed(2, ROUND_DOWN), approximate: true }
}

/* --- Formatting ----------------------------------------------------------- */

const formatters = new Map<string, Intl.NumberFormat>()

/** Both are `-IL`: the region decides grouping and the currency's own symbol. */
const TAGS: Record<Locale, string> = { en: 'en-IL', he: 'he-IL' }

function formatter(currency: string, signDisplay: 'auto' | 'never' | 'always'): Intl.NumberFormat {
  const locale = currentLocale()
  const key = `${locale}:${currency}:${signDisplay}`
  const cached = formatters.get(key)
  if (cached) return cached

  let made: Intl.NumberFormat
  try {
    made = new Intl.NumberFormat(TAGS[locale], {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      signDisplay,
    })
  } catch {
    // An unknown currency code should not blank out every amount on screen.
    made = new Intl.NumberFormat(TAGS[locale], { minimumFractionDigits: 2, signDisplay })
  }
  formatters.set(key, made)
  return made
}

/**
 * Render an amount.
 *
 * `Intl.NumberFormat` accepts a **string** and formats it exactly, so the value
 * never passes through a float on its way to the screen. It also decides which
 * side the currency symbol goes, which means right-to-left Hebrew is handled
 * without this file knowing anything about direction.
 */
export function formatMoney(
  amount: string,
  currency = 'ILS',
  options: { sign?: 'auto' | 'never' | 'always' } = {},
): string {
  const sign = options.sign ?? 'never'
  const value = sign === 'never' ? abs(amount) : d(amount).toFixed(2)
  try {
    return formatter(currency, sign).format(value as unknown as number)
  } catch {
    return `${value} ${currency}`
  }
}
