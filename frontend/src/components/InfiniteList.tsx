import { type ReactNode, useEffect, useRef } from 'react'

import type { PagedResult } from '@/api/paged'
import { Button } from './Button'
import { ErrorState, ListRowSkeleton } from './feedback'
import { useT } from '@/i18n/i18nContext'

/**
 * Every paged list in the app.
 *
 * The sentinel loads the next page when it scrolls into view, **and** there is a
 * real "Load more" button behind it. That is not belt-and-braces: an
 * `IntersectionObserver` inside an iOS standalone PWA's scroll container is
 * unreliable, and an infinite list that silently stops loading looks exactly
 * like a list that has ended.
 */
export function InfiniteList<T>({
  query,
  renderItem,
  empty,
  skeletonRows = 5,
}: {
  query: PagedResult<T>
  renderItem: (item: T, index: number) => ReactNode
  empty: ReactNode
  skeletonRows?: number
}) {
  const t = useT()
  const sentinel = useRef<HTMLDivElement>(null)
  const { hasNextPage, fetchNextPage, isFetchingNextPage } = query

  useEffect(() => {
    const node = sentinel.current
    if (!node || !hasNextPage) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) fetchNextPage()
      },
      { rootMargin: '400px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasNextPage, fetchNextPage])

  if (query.isLoading) return <ListRowSkeleton count={skeletonRows} />
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />
  if (query.items.length === 0) return <>{empty}</>

  return (
    <>
      {query.items.map(renderItem)}

      {hasNextPage && (
        <div ref={sentinel} className="flex justify-center px-4 py-4">
          <Button variant="ghost" onClick={fetchNextPage} loading={isFetchingNextPage}>
            {isFetchingNextPage ? t('common.actions.loading') : t('common.actions.loadMore')}
          </Button>
        </div>
      )}
    </>
  )
}
