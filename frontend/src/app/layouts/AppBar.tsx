import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'

import { BackIcon } from '@/components/icons'
import { cn } from '@/lib/cn'

/**
 * The top bar.
 *
 * Sticky rather than fixed, so it scrolls with short pages instead of stealing
 * height from them, and padded past the notch with `--sw-safe-block-start`.
 *
 * `variant="modal"` is the second shape the app needs: a form you either finish
 * or abandon gets a worded "Cancel" and a centred title instead of a back
 * chevron, because a chevron on a half-filled form reads as "go back and keep
 * this" and that is not what happens.
 */
export function AppBar({
  title,
  back,
  leading,
  actions,
  variant = 'page',
  className,
}: {
  title: ReactNode
  /** `true` goes back in history; a string navigates to that path. */
  back?: boolean | string
  /** Replaces the back button on the leading edge. */
  leading?: ReactNode
  actions?: ReactNode
  variant?: 'page' | 'modal'
  className?: string
}) {
  const navigate = useNavigate()
  const modal = variant === 'modal'

  return (
    <header
      className={cn(
        'bg-ground/85 border-line sticky top-0 z-20 border-b backdrop-blur-md',
        className,
      )}
      style={{ paddingBlockStart: 'var(--sw-safe-block-start)' }}
    >
      <div className="mx-auto flex h-13 max-w-2xl items-center gap-2 px-2">
        {leading ??
          (back && (
            <button
              type="button"
              aria-label="Back"
              onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
              className="text-ink hover:bg-sunken rounded-md p-2 transition-colors"
            >
              <BackIcon />
            </button>
          ))}
        <h1
          className={cn(
            'font-display flex-1 truncate text-lg font-bold',
            modal && 'text-center',
            !modal && !back && !leading && 'ps-2',
          )}
        >
          {title}
        </h1>
        {actions ? (
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        ) : (
          // A centred title is only centred if both edges weigh the same.
          modal && (leading || back) && <span aria-hidden="true" className="w-16 shrink-0" />
        )}
      </div>
    </header>
  )
}
