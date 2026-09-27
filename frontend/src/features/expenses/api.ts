import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/api/client'
import { invalidateLedger } from '@/api/invalidate'
import { usePagedQuery } from '@/api/paged'
import { qk } from '@/api/queryKeys'
import type {
  Expense,
  ExpenseCategory,
  ExpenseSource,
  ItemIn,
  Page,
  ParticipantIn,
  SplitType,
} from '@/api/types'

export type ExpenseFilters = {
  category?: ExpenseCategory
  payer_id?: string
  date_from?: string
  date_to?: string
}

export function useExpenses(groupId: string, filters: ExpenseFilters = {}) {
  return usePagedQuery<Expense>({
    queryKey: qk.groups.expenses(groupId, filters),
    fetchPage: ({ limit, offset, signal }) =>
      unwrap<Page<Expense>>(
        api.GET('/api/groups/{group_id}/expenses', {
          params: { path: { group_id: groupId }, query: { limit, offset, ...filters } },
          signal,
        }),
      ),
  })
}

export function useExpense(expenseId: string | undefined) {
  return useQuery({
    queryKey: qk.expenses.detail(expenseId ?? ''),
    enabled: Boolean(expenseId),
    queryFn: ({ signal }) =>
      unwrap<Expense>(
        api.GET('/api/expenses/{expense_id}', {
          params: { path: { expense_id: expenseId as string } },
          signal,
        }),
      ),
  })
}

export type ExpenseInput = {
  title: string
  total_amount: string
  expense_date: string
  payer_id: string
  split_type: SplitType
  participants?: ParticipantIn[] | null
  category?: ExpenseCategory | null
  notes?: string | null
  apply_split_rule?: boolean
  source?: ExpenseSource
  /** Split line by line. Needs `split_type: 'EXACT'` and no `participants`. */
  items?: ItemIn[] | null
  ai_metadata?: Record<string, unknown> | null
}

export function useCreateExpense(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    /**
     * `idempotencyKey` is carried alongside the body rather than baked into it.
     *
     * The backend remembers a key per user per endpoint: the same key with the
     * same body returns the first resource, and the same key with a *different*
     * body is a 409. `createIdempotencyTracker` binds the key to a hash of the
     * body so editing a field after a failed submit mints a new one.
     */
    mutationFn: ({ input, idempotencyKey }: { input: ExpenseInput; idempotencyKey?: string }) =>
      unwrap<Expense>(
        api.POST('/api/groups/{group_id}/expenses', {
          params: { path: { group_id: groupId } },
          // `source` and `apply_split_rule` have server-side defaults, which the
          // generated types render as required (see the note in
          // `features/groups/api.ts`). Both are stated rather than worked around:
          // MANUAL is what a hand-entered expense is, and letting a standing
          // split rule fill in participants is the behaviour we want by default.
          body: { source: 'MANUAL', apply_split_rule: true, ...input },
          ...(idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {}),
        }),
      ),
    onSuccess: () => invalidateLedger(queryClient, groupId),
  })
}

export function useUpdateExpense(groupId: string, expenseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<ExpenseInput>) =>
      unwrap<Expense>(
        api.PATCH('/api/expenses/{expense_id}', {
          params: { path: { expense_id: expenseId } },
          body: input,
        }),
      ),
    onSuccess: () => {
      invalidateLedger(queryClient, groupId)
      void queryClient.invalidateQueries({ queryKey: qk.expenses.detail(expenseId) })
    },
  })
}

export function useDeleteExpense(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (expenseId: string) =>
      unwrap<void>(
        api.DELETE('/api/expenses/{expense_id}', { params: { path: { expense_id: expenseId } } }),
      ),
    onSuccess: () => invalidateLedger(queryClient, groupId),
  })
}
