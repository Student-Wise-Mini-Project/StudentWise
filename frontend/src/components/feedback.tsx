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
 *
 * Left-aligned, not centred. A centred block of text in the middle of an empty
 * screen reads as an error; this reads as the top of a page that has not been
 * filled in yet, which is what it is. It also means the icon, the title, the
 * sentence and the button all share one start edge with every list row on the
 * screen behind it -- and that edge mirrors for Hebrew on its own.
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
    <div className={cn('flex flex-col text-start', size === 'page' ? 'px-4 py-10' : 'px-4 py-6')}>
      {icon && (
        <span className="bg-sunken text-muted mb-3.5 grid size-11 shrink-0 place-items-center rounded-md">
          {icon}
        </span>
      )}
      <h3
        className={cn(
          'font-display font-extrabold',
          size === 'page' ? 'text-xl tracking-[-0.015em]' : 'text-base',
        )}
      >
        {title}
      </h3>
      {body && <p className="text-muted mt-1.5 max-w-[38ch] text-sm">{body}</p>}
      {action && (
        <span className="mt-4">
          {action.to ? (
            <LinkButton to={action.to}>{action.label}</LinkButton>
          ) : (
            <Button onClick={action.onClick}>{action.label}</Button>
          )}
        </span>
      )}
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
    <div className={cn('flex flex-col text-start', size === 'page' ? 'px-4 py-10' : 'px-4 py-6')}>
      <h3 className="font-display text-xl font-extrabold tracking-[-0.015em]">{title}</h3>
      <p className="text-muted mt-1.5 max-w-[38ch] text-sm">{detailOf(error)}</p>
      {onRetry && (
        <span className="mt-4">
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        </span>
      )}
    </div>
  )
}

export function Skeleton({
  className,
  rounded = 'sm',
}: {
  className?: string
  rounded?: 'sm' | 'md'
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('shimmer block', rounded === 'md' ? 'rounded-md' : 'rounded-sm', className)}
    />
  )
}

/** What a list looks like while it loads. Same shape as a real row, so nothing jumps. */
export function ListRowSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="bg-surface border-line divide-line divide-y border-y" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-9.5" rounded="md" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  )
}
