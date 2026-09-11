import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

export type BadgeTone = 'neutral' | 'accent' | 'credit' | 'debt' | 'warn' | 'danger'

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-sunken text-muted',
  accent: 'bg-accent-soft text-accent',
  credit: 'bg-credit-soft text-credit',
  debt: 'bg-debt-soft text-debt',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
}

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** An unread count. Caps the number so a badge cannot stretch a tab bar. */
export function CountBadge({ count, max = 99 }: { count: number; max?: number }) {
  if (count <= 0) return null
  return (
    <span
      className="bg-debt text-on-accent tnum text-2xs inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 font-bold"
      aria-label={`${count} unread`}
    >
      {count > max ? `${max}+` : count}
    </span>
  )
}
