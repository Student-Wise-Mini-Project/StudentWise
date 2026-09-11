import { cn } from '@/lib/cn'
import { type ApproximateAmount, formatMoney, isNegative, isPositive } from '@/lib/money'

const SIZES = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg font-semibold',
  display: 'font-display text-3xl font-semibold tracking-tight',
} as const

export type MoneyTone = 'neutral' | 'auto' | 'credit' | 'debt' | 'muted'

const TONES: Record<MoneyTone, string> = {
  neutral: 'text-ink',
  auto: '',
  credit: 'text-credit',
  debt: 'text-debt',
  muted: 'text-muted',
}

export type MoneyProps = {
  /** A decimal string from the API, never a number. */
  amount: string | ApproximateAmount
  currency?: string
  /** `auto` colours by sign: positive is a credit, negative is a debt. */
  tone?: MoneyTone
  sign?: 'auto' | 'never' | 'always'
  size?: keyof typeof SIZES
  className?: string
}

/**
 * The only place a money string becomes pixels.
 *
 * Two things it guarantees that a `<span>{amount}</span>` would not:
 *
 * 1. **The value never passes through a float.** `Intl.NumberFormat` formats the
 *    string exactly; formatting `"9007199254740993.01"` as a number is off by a
 *    whole shekel. It also decides which side the currency symbol goes on, which
 *    is how right-to-left Hebrew works here without this file knowing about
 *    direction at all.
 * 2. **An approximate amount cannot be rendered as an exact one.** Pass the
 *    `{value, approximate: true}` that `divideForDisplay` returns and the `≈`
 *    appears automatically, along with a screen-reader label that says so. There
 *    is no way to get an equal-split preview onto the screen without it.
 *
 * Colour is never the only carrier of meaning: `sign="always"` or a nearby label
 * says which way the money goes, because red/green is the commonest colour-vision
 * deficiency there is.
 */
export function Money({
  amount,
  currency = 'ILS',
  tone = 'neutral',
  sign = 'never',
  size = 'md',
  className,
}: MoneyProps) {
  const approximate = typeof amount === 'object'
  const value = approximate ? amount.value : amount

  const autoTone = isPositive(value)
    ? 'text-credit'
    : isNegative(value)
      ? 'text-debt'
      : 'text-muted'
  const formatted = formatMoney(value, currency, { sign })

  return (
    <span
      className={cn(
        'tnum whitespace-nowrap',
        SIZES[size],
        tone === 'auto' ? autoTone : TONES[tone],
        className,
      )}
      aria-label={approximate ? `approximately ${formatted}` : undefined}
    >
      {approximate && (
        <span aria-hidden="true" className="text-muted me-0.5">
          ≈
        </span>
      )}
      {formatted}
    </span>
  )
}
