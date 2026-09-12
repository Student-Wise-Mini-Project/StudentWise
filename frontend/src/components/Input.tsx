import type { InputHTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/cn'

import { inputClasses } from './inputStyles'

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  slotStart?: ReactNode
  slotEnd?: ReactNode
}

export function Input({ slotStart, slotEnd, className, ...rest }: InputProps) {
  if (!slotStart && !slotEnd) {
    return <input className={cn(inputClasses, className)} {...rest} />
  }

  return (
    <div className="relative flex items-center">
      {slotStart && (
        <span className="text-muted pointer-events-none absolute inset-s-3 flex items-center">
          {slotStart}
        </span>
      )}
      <input
        className={cn(inputClasses, slotStart && 'ps-9', slotEnd && 'pe-9', className)}
        {...rest}
      />
      {slotEnd && (
        <span className="text-muted absolute inset-e-3 flex items-center">{slotEnd}</span>
      )}
    </div>
  )
}

export function Textarea({
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputClasses, 'h-auto min-h-20 py-2.5', className)} {...rest} />
}

export function Select({ className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  // A native <select> on purpose: iOS gives it a proper wheel picker, which beats
  // anything a custom listbox does with one thumb.
  return <select className={cn(inputClasses, 'pe-8', className)} {...rest} />
}
