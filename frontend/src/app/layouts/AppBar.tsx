import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'

import { BackIcon } from '@/components/icons'
import { cn } from '@/lib/cn'

/**
 * The top bar.
 *
 * Sticky rather than fixed, so it scrolls with short pages instead of stealing
 * height from them, and padded past the notch with `--sw-safe-block-start`.
 */
export function AppBar({
  title,
  back,
  actions,
  className,
}: {
  title: ReactNode
  /** `true` goes back in history; a string navigates to that path. */
  back?: boolean | string
  actions?: ReactNode
  className?: string
}) {
  const navigate = useNavigate()

  return (
    <header
      className={cn(
        'bg-ground/85 border-line sticky top-0 z-20 border-b backdrop-blur-md',
        className,
      )}
      style={{ paddingBlockStart: 'var(--sw-safe-block-start)' }}
    >
      <div className="mx-auto flex h-13 max-w-2xl items-center gap-2 px-2">
        {back && (
          <button
            type="button"
            aria-label="Back"
            onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
            className="text-ink hover:bg-sunken rounded-md p-2 transition-colors"
          >
            <BackIcon />
          </button>
        )}
        <h1 className={cn('font-display flex-1 truncate text-lg font-bold', !back && 'ps-2')}>
          {title}
        </h1>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
    </header>
  )
}
