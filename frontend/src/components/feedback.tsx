import type { ReactNode } from 'react'

import { detailOf } from '@/api/errors'
import { cn } from '@/lib/cn'

import { Button, LinkButton } from './Button'

/**
 * A zero state that says what to do next.
 *
 * There are eight or more of these in the app -- no groups, no expenses, no
 * comments, nothing owed, no notifications -- and they are most of a new user's
 * first impression, so they get a real component rather than a grey sentence.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  size = 'page',
}: {
  icon?: ReactNode
  title: string
  body?: string
  action?: { label: string; to?: string; onClick?: () => void }
  size?: 'inline' | 'page'
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 text-center',
        size === 'page' ? 'px-6 py-16' : 'px-4 py-8',
      )}
    >
      {icon && <div className="text-faint mb-1">{icon}</div>}
      <h3 className={cn('font-display font-semibold', size === 'page' ? 'text-xl' : 'text-base')}>
        {title}
      </h3>
      {body && <p className="text-muted max-w-xs text-sm">{body}</p>}
      {action &&
        (action.to ? (
          <LinkButton to={action.to} className="mt-3">
            {action.label}
          </LinkButton>
        ) : (
          <Button className="mt-3" onClick={action.onClick}>
            {action.label}
          </Button>
        ))}
    </div>
  )
}

/** A failed request, with the API's own `detail` and a way to try again. */
export function ErrorState({
  title = 'That did not load',
  error,
  onRetry,
  size = 'page',
}: {
  title?: string
  error?: unknown
  onRetry?: () => void
  size?: 'inline' | 'page'
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 text-center',
        size === 'page' ? 'px-6 py-16' : 'px-4 py-8',
      )}
    >
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="text-muted max-w-xs text-sm">{detailOf(error)}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function Skeleton({
  className,
  rounded = 'md',
}: {
  className?: string
  rounded?: 'md' | 'full'
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'bg-sunken block animate-pulse',
        rounded === 'full' ? 'rounded-full' : 'rounded-md',
        className,
      )}
    />
  )
}

/** What a list looks like while it loads. Same shape as a real row, so nothing jumps. */
export function ListRowSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="bg-surface border-line divide-line divide-y border-y" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-10" rounded="full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}
