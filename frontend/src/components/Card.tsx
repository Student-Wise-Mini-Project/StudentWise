import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/cn'

const PADDING = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-5' } as const

/**
 * A raised surface.
 *
 * Not everything is a card -- border, fill, radius and shadow each say "separate
 * object", and stamping one on every block flattens the hierarchy rather than
 * creating it. Use this for things that genuinely are their own object.
 */
export function Card({
  padding = 'md',
  elevated = false,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  padding?: keyof typeof PADDING
  elevated?: boolean
}) {
  return (
    <div
      className={cn(
        'bg-surface border-line rounded-xl border',
        elevated && 'shadow-raised',
        PADDING[padding],
        className,
      )}
      {...rest}
    />
  )
}
