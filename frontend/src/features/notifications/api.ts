import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/api/client'
import { qk } from '@/api/queryKeys'
import type { Notification, Page } from '@/api/types'
import { usePagedQuery } from '@/api/paged'

export function useNotifications(unreadOnly: boolean) {
  return usePagedQuery<Notification>({
    queryKey: qk.notifications.list(unreadOnly),
    fetchPage: ({ limit, offset, signal }) =>
      unwrap<Page<Notification>>(
        api.GET('/api/notifications', {
          params: { query: { limit, offset, unread_only: unreadOnly } },
          signal,
        }),
      ),
  })
}

/**
 * The badge on the bell.
 *
 * Its own endpoint rather than counting the list, because the badge is wanted on
 * every screen and the list is not. `refetchInterval` is deliberately absent:
 * there is no push channel, and polling every few seconds to find out that
 * nothing happened is a battery cost paid by a phone in someone's pocket. It
 * refreshes when the window regains focus and after anything that could have
 * created one.
 */
export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: qk.notifications.unreadCount(),
    enabled,
    staleTime: 30_000,
    queryFn: ({ signal }) =>
      unwrap<{ unread: number }>(api.GET('/api/notifications/unread-count', { signal })),
  })
}

export function useMarkRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (notificationId: string) =>
      unwrap<Notification>(
        api.POST('/api/notifications/{notification_id}/read', {
          params: { path: { notification_id: notificationId } },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.notifications.all() })
    },
  })
}

export function useMarkAllRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => unwrap<{ marked_read: number }>(api.POST('/api/notifications/read-all', {})),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.notifications.all() })
    },
  })
}
