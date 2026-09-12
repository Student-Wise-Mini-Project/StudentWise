import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { api, unwrap } from '@/api/client'
import { invalidateLedger } from '@/api/invalidate'
import { qk } from '@/api/queryKeys'
import type {
  Expense,
  RecurringBill,
  RecurringBillCreate,
  RecurringBillUpdate,
  RunResult,
} from '@/api/types'

/**
 * Nothing runs on a scheduler, so the app has to ask.
 *
 * `POST .../recurring-bills/run` posts every bill that has come due and reminds
 * about the ones whose amount varies. The README states the app calls it on
 * load, and it is idempotent -- a unique index makes posting the same bill twice
 * for one date a 409 -- so calling it is safe but not free.
 *
 * Once per group per session, therefore: on every render would be a write
 * request behind every navigation, and on every app load would fire it for a
 * group nobody opened.
 */
const alreadyRun = new Set<string>()

export function useRunDueBillsOnce(groupId: string | undefined) {
  const queryClient = useQueryClient()

  const run = useMutation({
    mutationFn: (id: string) =>
      unwrap<RunResult>(
        api.POST('/api/groups/{group_id}/recurring-bills/run', {
          params: { path: { group_id: id } },
        }),
      ),
    onSuccess: (result, id) => {
      // Only disturb the caches if something actually happened. A run that posts
      // nothing is the common case and should be invisible.
      if (result.generated.length > 0) invalidateLedger(queryClient, id)
    },
  })

  const { mutate } = run
  useEffect(() => {
    if (!groupId || alreadyRun.has(groupId)) return
    alreadyRun.add(groupId)
    mutate(groupId)
  }, [groupId, mutate])

  return run
}

/** Test seam: lets a test start from a clean slate. */
export function resetRunTracking(): void {
  alreadyRun.clear()
}

/**
 * The group's schedules, soonest due first.
 *
 * The API already orders them; this deliberately does not re-sort. Two sort
 * orders for one list is how a screen ends up disagreeing with its own API.
 */
export function useRecurringBills(groupId: string) {
  return useQuery({
    queryKey: qk.groups.recurringBills(groupId),
    queryFn: ({ signal }) =>
      unwrap<RecurringBill[]>(
        api.GET('/api/groups/{group_id}/recurring-bills', {
          params: { path: { group_id: groupId } },
          signal,
        }),
      ),
  })
}

/**
 * Writing a schedule invalidates the schedules and nothing else.
 *
 * A schedule is not money: setting one up, renaming it or pausing it moves
 * nothing in the balances, the expense list or the feed. Only `useGenerateBill`
 * below touches the ledger, because only posting a bill creates an expense.
 */
export function useCreateBill(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RecurringBillCreate) =>
      unwrap<RecurringBill>(
        api.POST('/api/groups/{group_id}/recurring-bills', {
          params: { path: { group_id: groupId } },
          body: input,
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.groups.recurringBills(groupId) })
    },
  })
}

export function useUpdateBill(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ billId, input }: { billId: string; input: RecurringBillUpdate }) =>
      unwrap<RecurringBill>(
        api.PATCH('/api/groups/{group_id}/recurring-bills/{bill_id}', {
          params: { path: { group_id: groupId, bill_id: billId } },
          body: input,
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.groups.recurringBills(groupId) })
    },
  })
}

export function useDeleteBill(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (billId: string) =>
      unwrap<void>(
        api.DELETE('/api/groups/{group_id}/recurring-bills/{bill_id}', {
          params: { path: { group_id: groupId, bill_id: billId } },
        }),
      ),
    // Expenses this bill already posted are untouched by the API, so the
    // ledger is not stale either.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.groups.recurringBills(groupId) })
    },
  })
}

/**
 * Post a bill now -- how a varying bill gets recorded.
 *
 * This one *does* invalidate the ledger: it creates a real expense and moves
 * the schedule on to its next due date, so both are stale.
 */
export function useGenerateBill(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      billId,
      amount,
      expense_date,
    }: {
      billId: string
      amount?: string | null
      expense_date?: string | null
    }) =>
      unwrap<Expense>(
        api.POST('/api/groups/{group_id}/recurring-bills/{bill_id}/generate', {
          params: { path: { group_id: groupId, bill_id: billId } },
          body: { amount: amount ?? null, expense_date: expense_date ?? null },
        }),
      ),
    onSuccess: () => {
      invalidateLedger(queryClient, groupId)
      void queryClient.invalidateQueries({ queryKey: qk.groups.recurringBills(groupId) })
    },
  })
}
