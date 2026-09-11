import { useQueries } from '@tanstack/react-query'

import { api, unwrap } from '@/api/client'
import { usePagedQuery } from '@/api/paged'
import { qk } from '@/api/queryKeys'
import type { ActivityItem, Group, GroupBalances, Page } from '@/api/types'

/** The cross-group feed. `limit` is capped at 100 by the API. */
export function useActivityFeed() {
  return usePagedQuery<ActivityItem>({
    queryKey: qk.activity.feed(),
    limit: 20,
    fetchPage: ({ limit, offset, signal }) =>
      unwrap<Page<ActivityItem>>(
        api.GET('/api/activity', { params: { query: { limit, offset } }, signal }),
      ),
  })
}

/**
 * Your position across every group, for the headline on the home screen.
 *
 * There is no cross-group balances endpoint, so this fans out over the groups
 * you are in. That is fine at this scale -- a person is in a handful of groups,
 * not hundreds -- and `useQueries` runs them in parallel and caches each under
 * the same key the group's own balances screen uses, so opening a group after
 * this is instant and the two can never disagree.
 *
 * If someone ever ends up in fifty groups this wants a single endpoint. Noted
 * rather than pre-solved.
 */
export function useOverallPosition(groups: Group[] | undefined, userId: string | undefined) {
  const queries = useQueries({
    queries: (groups ?? []).map((group) => ({
      queryKey: qk.groups.balances(group.id),
      staleTime: 0,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        unwrap<GroupBalances>(
          api.GET('/api/groups/{group_id}/balances', {
            params: { path: { group_id: group.id } },
            signal,
          }),
        ),
    })),
  })

  const loading = queries.some((query) => query.isLoading)
  const names = new Map((groups ?? []).map((group) => [group.id, group.name]))
  const perGroup = queries
    .map((query) => query.data)
    .filter((data): data is GroupBalances => Boolean(data))
    .map((data) => ({
      groupId: data.group_id,
      // The balances payload does not carry the group's name and the slab's
      // chips need it; `groups` is already in hand, so no second request.
      name: names.get(data.group_id) ?? '',
      currency: data.currency,
      net: data.balances.find((row) => row.user.id === userId)?.net ?? '0.00',
    }))

  return { loading, perGroup }
}
