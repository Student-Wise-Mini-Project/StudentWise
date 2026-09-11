import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/api/client'
import { invalidateLedger } from '@/api/invalidate'
import { qk } from '@/api/queryKeys'
import type { GroupBalances, Notification, SettlementCreate, SettlementPlan } from '@/api/types'

/**
 * Balances and the settlement plan are the numbers people argue about, so they
 * are never served stale: `staleTime: 0` means they refetch whenever the screen
 * regains focus.
 */
export function useBalances(groupId: string) {
  return useQuery({
    queryKey: qk.groups.balances(groupId),
    staleTime: 0,
    queryFn: ({ signal }) =>
      unwrap<GroupBalances>(
        api.GET('/api/groups/{group_id}/balances', {
          params: { path: { group_id: groupId } },
          signal,
        }),
      ),
  })
}

export function useSettlementPlan(groupId: string) {
  return useQuery({
    queryKey: qk.groups.plan(groupId),
    staleTime: 0,
    queryFn: ({ signal }) =>
      unwrap<SettlementPlan>(
        api.GET('/api/groups/{group_id}/settlement-plan', {
          params: { path: { group_id: groupId } },
          signal,
        }),
      ),
  })
}

/**
 * Record that a payment actually happened.
 *
 * The settlement plan is a suggestion and writes nothing; this is what moves the
 * balances. Sending it separately is the point -- the app must never assume a
 * suggested transfer took place.
 */
export function useRecordSettlement(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: SettlementCreate; idempotencyKey?: string }) =>
      unwrap(
        api.POST('/api/groups/{group_id}/settlements', {
          params: { path: { group_id: groupId } },
          body: input,
          ...(idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {}),
        }),
      ),
    onSuccess: () => invalidateLedger(queryClient, groupId),
  })
}

/**
 * Nudge the people who owe **you**.
 *
 * Deliberately narrow on the server side: you cannot remind someone who does not
 * owe you, and the amount comes from the settlement plan rather than the request
 * body. A reminder anyone could send to anyone for any amount is a harassment
 * feature, not a payments feature.
 */
export function useSendReminders(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (debtorIds?: string[]) =>
      unwrap<Notification[]>(
        api.POST('/api/groups/{group_id}/reminders', {
          params: { path: { group_id: groupId } },
          body: debtorIds ? { debtor_ids: debtorIds } : {},
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.notifications.all() })
    },
  })
}
