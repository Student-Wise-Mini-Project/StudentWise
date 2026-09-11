import { type ChangeEvent, type FocusEvent, type InputHTMLAttributes, useState } from 'react'

import { cn } from '@/lib/cn'
import { parseUserAmount } from '@/lib/money'

import { inputClasses } from './inputStyles'

export type MoneyInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'size'
> & {
  /** A decimal string, as the API speaks it. */
  value: string
  onValueChange: (value: string) => void
  currencySymbol?: string
  /**
   * `field` is a normal boxed control, for the per-person amounts in an exact
   * split and the settle-up sheet. `hero` is the one amount a screen is *about*
   * -- no box at all, just the number at 44px over a 2px accent rule, which is
   * the whole point of the add-expense screen.
   */
  size?: 'field' | 'hero'
}

/**
 * An amount field that never turns money into a number.
 *
 * What the user types is kept verbatim while they type -- normalising on every
 * keystroke fights the person entering "12." on their way to "12.50" -- and is
 * normalised on blur, once. `parseUserAmount` works out whether a comma is a
 * decimal point or a thousands separator, so "1,234.50" and "1.234,50" both
 * arrive as "1234.50" rather than as nothing.
 *
 * `inputMode="decimal"` is what raises the numeric keypad on a phone, which for
 * a one-handed app in a supermarket queue matters more than it sounds.
 */
export function MoneyInput({
  value,
  onValueChange,
  currencySymbol = '₪',
  size = 'field',
  className,
  onBlur,
  ...rest
}: MoneyInputProps) {
  const [draft, setDraft] = useState<string | null>(null)

  const commit = (event: FocusEvent<HTMLInputElement>) => {
    const parsed = parseUserAmount(draft ?? value)
    // null means "not a number yet" -- keep what they typed rather than
    // silently emptying the field under their fingers.
    if (parsed !== null) onValueChange(parsed)
    setDraft(null)
    onBlur?.(event)
  }

  const shared = {
    ...rest,
    type: 'text' as const,
    inputMode: 'decimal' as const,
    autoComplete: 'off',
    value: draft ?? value,
    onChange: (event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value),
    onBlur: commit,
  }

  if (size === 'hero') {
    return (
      // The rule is on the wrapper, not the input, so it sits under the symbol
      // and the number together and shrinks to their content.
      <span className="border-accent inline-flex items-baseline gap-1.5 border-b-2 px-2 pb-1.5">
        <span aria-hidden="true" className="text-faint font-display text-3xl font-bold">
          {currencySymbol}
        </span>
        <input
          {...shared}
          className={cn(
            'font-display tnum w-full min-w-0 border-0 bg-transparent p-0 font-black outline-none',
            'text-hero tracking-[-0.04em]',
            className,
          )}
        />
      </span>
    )
  }

  return (
    <div className="relative flex items-center">
      <span
        aria-hidden="true"
        className="text-faint pointer-events-none absolute start-3.5 text-base"
      >
        {currencySymbol}
      </span>
      <input
        {...shared}
        className={cn(inputClasses, 'tnum font-display ps-8 text-lg font-extrabold', className)}
      />
    </div>
  )
}
