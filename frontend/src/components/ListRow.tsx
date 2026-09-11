import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { cn } from '@/lib/cn'

export type ListRowProps = {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  /** The inline-end slot. Usually a `<Money/>`. */
  meta?: ReactNode
  metaSubtitle?: ReactNode
  trailing?: ReactNode
  to?: string
  onClick?: () => void
  dense?: boolean
  className?: string
}

/**
 * The backbone of the app.
 *
 * Expenses, members, groups, settlements, activity, notifications, balances and
 * planned transfers are all this component with different slots filled. That is
 * the point: one row shape means the whole app reads consistently, and a
 * redesign of "a row" is one file.
 */
export function ListRow({
  leading,
  title,
  subtitle,
  meta,
  metaSubtitle,
  trailing,
  to,
  onClick,
  dense = false,
  className,
}: ListRowProps) {
  const content = (
    <>
      {leading && <span className="shrink-0">{leading}</span>}

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-ink truncate text-base font-medium">{title}</span>
        {subtitle && <span className="text-muted truncate text-sm">{subtitle}</span>}
      </span>

      {(meta || metaSubtitle) && (
        <span className="flex shrink-0 flex-col items-end">
          {meta}
          {metaSubtitle && <span className="text-muted text-xs">{metaSubtitle}</span>}
        </span>
      )}

      {trailing && <span className="text-faint shrink-0">{trailing}</span>}
    </>
  )

  const classes = cn(
    'flex w-full items-center gap-3 text-start',
    dense ? 'px-4 py-2' : 'px-4 py-3',
    (to || onClick) && 'hover:bg-sunken active:bg-sunken transition-colors',
    className,
  )

  if (to) {
    return (
      <Link to={to} className={classes}>
        {content}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {content}
      </button>
    )
  }
  return <div className={classes}>{content}</div>
}

/** A grouped list. Dividers between rows, never above the first or below the last. */
export function ListSection({
  header,
  action,
  children,
  className,
}: {
  header?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col', className)}>
      {(header || action) && (
        <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
          {header && (
            <h2 className="text-muted text-xs font-semibold tracking-wide uppercase">{header}</h2>
          )}
          {action}
        </header>
      )}
      <div className="bg-surface border-line divide-line divide-y border-y">{children}</div>
    </section>
  )
}
