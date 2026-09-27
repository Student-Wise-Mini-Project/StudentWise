import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { api, unwrap } from '@/api/client'
import { invalidateLedger } from '@/api/invalidate'
import { qk } from '@/api/queryKeys'
import type { Expense, GmailStatus, GmailSync, IngestedBill, Page } from '@/api/types'

export function useGmailStatus() {
  return useQuery({
    queryKey: qk.gmail.status(),
    queryFn: ({ signal }) => unwrap<GmailStatus>(api.GET('/api/integrations/gmail', { signal })),
  })
}

/**
 * Leave the app for Google's consent page.
 *
 * The API returns the address rather than redirecting: a redirect request
 * cannot carry the Authorization header, so the server would not know who was
 * asking. Google sends the browser back to `/settings?gmail=...`.
 */
export function useConnectGmail() {
  return useMutation({
    mutationFn: () =>
      unwrap<{ authorization_url: string }>(api.POST('/api/integrations/gmail/connect')),
    onSuccess: ({ authorization_url }) => window.location.assign(authorization_url),
  })
}

export function useDisconnectGmail() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => unwrap<void>(api.DELETE('/api/integrations/gmail')),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.gmail.status() })
      void queryClient.invalidateQueries({ queryKey: qk.bills.all() })
    },
  })
}

function useSyncMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => unwrap<GmailSync>(api.POST('/api/integrations/gmail/sync')),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: qk.gmail.status() })
      void queryClient.invalidateQueries({ queryKey: qk.bills.all() })
      // An imported bill is a new expense somewhere. Which group is not in the
      // summary, so the group list and the feed are refreshed wholesale.
      if (result.imported > 0) {
        void queryClient.invalidateQueries({ queryKey: qk.groups.all() })
        void queryClient.invalidateQueries({ queryKey: qk.activity.feed() })
      }
    },
  })
}

/** "Check now", from settings. */
export function useSyncGmail() {
  return useSyncMutation()
}

/**
 * Nothing runs on a scheduler, so opening the app is what fetches new bills --
 * once per session, like recurring bills, and only for a mailbox that is
 * connected and working. Every email is read once however often this runs.
 */
let syncedThisSession = false

export function useSyncGmailOnce() {
  const status = useGmailStatus()
  const sync = useSyncMutation()
  const ready = status.data?.connected === true && !status.data.needs_reconnect
  const { mutate } = sync

  useEffect(() => {
    if (!ready || syncedThisSession) return
    syncedThisSession = true
    mutate()
  }, [ready, mutate])

  return { status, sync }
}

/** Test seam. */
export function resetGmailSyncTracking(): void {
  syncedThisSession = false
}

export function usePendingBills(enabled = true) {
  return useQuery({
    queryKey: qk.bills.pending(),
    enabled,
    queryFn: ({ signal }) =>
      unwrap<Page<IngestedBill>>(
        api.GET('/api/bills', {
          params: { query: { status: 'PENDING_REVIEW', limit: 50, offset: 0 } },
          signal,
        }),
      ),
  })
}

export function useApproveBill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      billId,
      groupId,
      totalAmount,
    }: {
      billId: string
      groupId: string
      totalAmount?: string
    }) =>
      unwrap<Expense>(
        api.POST('/api/bills/{bill_id}/approve', {
          params: { path: { bill_id: billId } },
          body: { group_id: groupId, ...(totalAmount ? { total_amount: totalAmount } : {}) },
        }),
      ),
    onSuccess: (_, { groupId }) => {
      void queryClient.invalidateQueries({ queryKey: qk.bills.all() })
      invalidateLedger(queryClient, groupId)
    },
  })
}

export function useDismissBill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (billId: string) =>
      unwrap<IngestedBill>(
        api.POST('/api/bills/{bill_id}/dismiss', { params: { path: { bill_id: billId } } }),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.bills.all() }),
  })
}
