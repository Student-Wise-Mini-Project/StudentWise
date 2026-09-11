import { type InputHTMLAttributes, useState } from 'react'

import { cn } from '@/lib/cn'
import { parseUserAmount } from '@/lib/money'

import { inputClasses } from './inputStyles'

export type MoneyInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> & {
  /** A decimal string, as the API speaks it. */
  value: string
  onValueChange: (value: string) => void
  currencySymbol?: string
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
  className,
  onBlur,
  ...rest
}: MoneyInputProps) {
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <div className="relative flex items-center">
      <span
        aria-hidden="true"
        className="text-muted pointer-events-none absolute start-3 text-base"
      >
        {currencySymbol}
      </span>
      <input
        {...rest}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={draft ?? value}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => {
          const parsed = parseUserAmount(draft ?? value)
          // null means "not a number yet" -- keep what they typed rather than
          // silently emptying the field under their fingers.
          if (parsed !== null) onValueChange(parsed)
          setDraft(null)
          onBlur?.(event)
        }}
        className={cn(inputClasses, 'tnum ps-8 text-lg font-semibold', className)}
      />
    </div>
  )
}
