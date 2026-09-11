import { cn } from '@/lib/cn'
import { type ApproximateAmount, formatMoney, isNegative, isPositive } from '@/lib/money'

/**
 * Money is the heaviest ink on every screen, at every size. Heebo 800 with
 * tabular figures throughout; only the size and the tracking change.
 */
const SIZES = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  display: 'text-4xl tracking-[-0.03em]',
  hero: 'text-hero tracking-[-0.035em]',
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
  /**
   * Defaults to `always` for the three tones that mean "this is a balance", and
   * to `never` otherwise. A plain total ("this shop cost ₪212.30") has no sign;
   * a credit or a debt always has one, because colour alone fails the commonest
   * colour-vision deficiency.
   */
  sign?: 'auto' | 'never' | 'always'
  size?: keyof typeof SIZES
  className?: string
}

const SIGNED_TONES = new Set<MoneyTone>(['auto', 'credit', 'debt'])

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
  sign,
  size = 'md',
  className,
}: MoneyProps) {
  const approximate = typeof amount === 'object'
  const value = approximate ? amount.value : amount
  const signDisplay = sign ?? (SIGNED_TONES.has(tone) ? 'always' : 'never')

  const autoTone = isPositive(value)
    ? 'text-credit'
    : isNegative(value)
      ? 'text-debt'
      : 'text-muted'
  const formatted = formatMoney(value, currency, { sign: signDisplay })

  return (
    <span
      className={cn(
        'tnum font-display font-extrabold whitespace-nowrap',
        SIZES[size],
        tone === 'auto' ? autoTone : TONES[tone],
        className,
      )}
      // An amount is a left-to-right run wherever it appears. Without this, a
      // leading `+` or `−` is bidi-reordered to the trailing end inside an RTL
      // paragraph and `+₪412.60` renders as `₪412.60+` -- the app's single most
      // load-bearing character, silently moved. Isolating here rather than at
      // each call site means no screen has to remember.
      style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
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
