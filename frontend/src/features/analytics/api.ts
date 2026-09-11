import { useQuery } from '@tanstack/react-query'

import { api, unwrap } from '@/api/client'
import type { CategoryBreakdown, MemberBreakdown, MonthlyTrend, Summary } from '@/api/types'

/**
 * Read-only analytics.
 *
 * `summary`, `by-category` and `by-month` take an optional `user_id`, and it
 * changes what the number *means*: without it they report what the group spent
 * (the sum of expense totals); with it they report what one person consumed
 * (their share of each split). The response echoes `scope` so the UI can say
 * which it is showing rather than leaving the reader to guess.
 *
 * `by-member` has no `user_id` -- it is already per person.
 */
export type AnalyticsScope = { userId?: string }

const STALE = 60_000

function scopeKey(groupId: string, name: string, scope: AnalyticsScope) {
  return ['groups', 'detail', groupId, 'analytics', name, scope.userId ?? 'group'] as const
}

export function useSummary(groupId: string, scope: AnalyticsScope = {}) {
  return useQuery({
    queryKey: scopeKey(groupId, 'summary', scope),
    staleTime: STALE,
    queryFn: ({ signal }) =>
      unwrap<Summary>(
        api.GET('/api/groups/{group_id}/analytics/summary', {
          params: { path: { group_id: groupId }, query: { user_id: scope.userId } },
          signal,
        }),
      ),
  })
}

export function useByCategory(groupId: string, scope: AnalyticsScope = {}) {
  return useQuery({
    queryKey: scopeKey(groupId, 'by-category', scope),
    staleTime: STALE,
    queryFn: ({ signal }) =>
      unwrap<CategoryBreakdown>(
        api.GET('/api/groups/{group_id}/analytics/by-category', {
          params: { path: { group_id: groupId }, query: { user_id: scope.userId } },
          signal,
        }),
      ),
  })
}

export function useByMonth(groupId: string, scope: AnalyticsScope = {}) {
  return useQuery({
    queryKey: scopeKey(groupId, 'by-month', scope),
    staleTime: STALE,
    queryFn: ({ signal }) =>
      unwrap<MonthlyTrend>(
        api.GET('/api/groups/{group_id}/analytics/by-month', {
          params: { path: { group_id: groupId }, query: { user_id: scope.userId } },
          signal,
        }),
      ),
  })
}

export function useByMember(groupId: string) {
  return useQuery({
    queryKey: scopeKey(groupId, 'by-member', {}),
    staleTime: STALE,
    queryFn: ({ signal }) =>
      unwrap<MemberBreakdown>(
        api.GET('/api/groups/{group_id}/analytics/by-member', {
          params: { path: { group_id: groupId } },
          signal,
        }),
      ),
  })
}
