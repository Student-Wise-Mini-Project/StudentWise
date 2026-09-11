import type { ReactNode } from 'react'
import { useId } from 'react'

import { cn } from '@/lib/cn'

export type FieldProps = {
  label: string
  /** Render the control, wired to the ids this component generates. */
  children: (props: {
    id: string
    'aria-describedby': string | undefined
    'aria-invalid': true | undefined
  }) => ReactNode
  hint?: string
  error?: string
  required?: boolean
  className?: string
}

/**
 * Label, hint and error, wired together correctly.
 *
 * Every control in the app goes through this, which is what makes form styling
 * uniform and the accessibility wiring not a per-form decision. `aria-invalid`
 * and `aria-describedby` are the difference between a screen reader saying "the
 * amount is invalid, it must be greater than zero" and saying "edit text".
 */
export function Field({ label, children, hint, error, required, className }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-ink text-sm font-semibold">
        {label}
        {required && (
          <span className="text-muted ms-1 font-normal" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {children({
        id,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : undefined,
      })}

      {hint && !error && (
        <p id={hintId} className="text-muted text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-danger text-xs font-medium">
          {error}
        </p>
      )}
    </div>
  )
}
