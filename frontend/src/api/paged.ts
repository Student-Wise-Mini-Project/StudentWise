import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query'

import type { Page } from './types'

/**
 * The one place in the app that computes an offset.
 *
 * Every paged endpoint returns `{items, total, limit, offset, has_more}`, which
 * *is* a cursor: `has_more ? offset + limit : undefined` is the whole adapter,
 * with no arithmetic on `total`. Infinite scrolling rather than numbered pages,
 * because a page-number control is a poor fit for a thumb and because navigating
 * away would throw the loaded pages out.
 *
 * `total` is not lost by doing it this way -- the last loaded page still carries
 * it, so a header can honestly say "18 expenses" while the body shows 20 rows.
 *
 * Writes never splice this cache. Inserting an expense shifts every subsequent
 * offset, so a hand-maintained list eventually shows a row twice or skips one;
 * mutations invalidate the key and let every loaded page refetch instead.
 */
export type PagedResult<T> = {
  items: T[]
  total: number
  hasNextPage: boolean
  fetchNextPage: () => void
  isLoading: boolean
  isFetchingNextPage: boolean
  isError: boolean
  error: unknown
  refetch: () => void
}

export function usePagedQuery<T>(options: {
  queryKey: QueryKey
  fetchPage: (params: { limit: number; offset: number; signal: AbortSignal }) => Promise<Page<T>>
  /** Fixed for the life of a list: changing it mid-scroll repeats or skips rows. */
  limit?: number
  enabled?: boolean
}): PagedResult<T> {
  const limit = options.limit ?? 20

  const query = useInfiniteQuery({
    queryKey: options.queryKey,
    enabled: options.enabled ?? true,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      options.fetchPage({ limit, offset: pageParam as number, signal }),
    getNextPageParam: (lastPage) =>
      lastPage.has_more ? lastPage.offset + lastPage.limit : undefined,
  })

  const pages = query.data?.pages ?? []

  return {
    items: pages.flatMap((page) => page.items),
    // The freshest page carries the truest count.
    total: pages.at(-1)?.total ?? 0,
    hasNextPage: query.hasNextPage,
    fetchNextPage: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage()
    },
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    isError: query.isError,
    error: query.error,
    refetch: () => void query.refetch(),
  }
}
