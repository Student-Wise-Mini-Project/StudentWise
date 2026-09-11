import { useT } from '@/i18n/i18nContext'
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
        'font-display text-2xs inline-flex items-center rounded-sm px-2 py-1 font-extrabold tracking-wide whitespace-nowrap uppercase',
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
  const t = useT()
  if (count <= 0) return null
  return (
    <span
      className="bg-debt font-display tnum text-2xs text-on-slab inline-flex min-w-5 items-center justify-center rounded-sm px-1.5 py-0.5 font-extrabold"
      aria-label={t('common.alerts.unreadCount', { count })}
    >
      {count > max ? `${max}+` : count}
    </span>
  )
}
