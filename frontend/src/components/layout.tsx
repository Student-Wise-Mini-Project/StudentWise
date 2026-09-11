import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * The page container. Owns the desktop max width and the side gutter, so no
 * screen sets either and they cannot drift apart.
 */
export function Page({
  width = 'narrow',
  padded = false,
  className,
  children,
}: {
  width?: 'narrow' | 'wide' | 'full'
  padded?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full',
        width === 'narrow' && 'max-w-2xl',
        width === 'wide' && 'max-w-5xl',
        padded && 'px-4',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** The only spacing primitive features may use, so gaps come from the scale. */
export function Stack({
  direction = 'column',
  gap = 3,
  className,
  children,
}: {
  direction?: 'row' | 'column'
  gap?: 1 | 2 | 3 | 4 | 5 | 6
  className?: string
  children: ReactNode
}) {
  const GAPS = { 1: 'gap-1', 2: 'gap-2', 3: 'gap-3', 4: 'gap-4', 5: 'gap-5', 6: 'gap-6' } as const
  return (
    <div
      className={cn('flex', direction === 'row' ? 'flex-row' : 'flex-col', GAPS[gap], className)}
    >
      {children}
    </div>
  )
}

/** A headline above a section of content. */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex items-start justify-between gap-3 px-4 pt-5 pb-3', className)}>
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-black tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="text-muted mt-0.5 text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}
