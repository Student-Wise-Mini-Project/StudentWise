import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/cn'

const PADDING = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-5' } as const

/**
 * A separated surface.
 *
 * A card here is a **hairline border, not a shadow**. Nothing that does not move
 * is stamped with one -- there are exactly two elevation levels above flat, and
 * both are reserved (`shadow-float` for the FAB bar and toasts, `shadow-sheet`
 * for bottom sheets). A page of drop-shadowed cards reads as rendered; the app
 * is meant to read as printed.
 *
 * Not everything is a card either -- border, fill and radius each say "separate
 * object", and stamping one on every block flattens the hierarchy rather than
 * creating it. Use this for things that genuinely are their own object.
 */
export function Card({
  padding = 'md',
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  padding?: keyof typeof PADDING
}) {
  return (
    <div
      className={cn('bg-surface border-line rounded-sm border', PADDING[padding], className)}
      {...rest}
    />
  )
}
