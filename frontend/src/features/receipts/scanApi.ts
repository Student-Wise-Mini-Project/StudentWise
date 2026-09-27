import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/api/client'
import { qk } from '@/api/queryKeys'
import type { Expense, ItemIn, ItemPreview, ReceiptScan } from '@/api/types'

/** A file as multipart, typed the way the generated client describes it. */
function multipart(file: File) {
  const body = new FormData()
  body.append('file', file)
  return {
    // OpenAPI can only describe a binary upload as `{ file: string }`. What goes
    // on the wire is FormData, and the browser must set the boundary itself,
    // so the body is passed through untouched. Same cast as `useUploadReceipt`.
    body: body as unknown as { file: string },
    bodySerializer: (value: unknown) => value as BodyInit,
  }
}

/** Read a photo into a draft. Stores nothing on the server. */
export function useScanReceipt(groupId: string) {
  return useMutation({
    mutationFn: (file: File) =>
      unwrap<ReceiptScan>(
        api.POST('/api/groups/{group_id}/receipts/scan', {
          params: { path: { group_id: groupId } },
          ...multipart(file),
        }),
      ),
  })
}

/**
 * What each person would owe, straight from the server.
 *
 * The client never divides money, so per-person totals on the review screen
 * come from here: the same arithmetic the save will use. The previous answer
 * stays on screen while a new one loads, so assigning a line does not flash
 * every amount blank.
 */
export function useItemPreview(
  groupId: string,
  body: { total_amount: string; items: ItemIn[] } | null,
) {
  return useQuery({
    queryKey: qk.groups.itemPreview(groupId, body),
    enabled: body !== null,
    placeholderData: keepPreviousData,
    retry: false,
    queryFn: ({ signal }) =>
      unwrap<ItemPreview>(
        api.POST('/api/groups/{group_id}/expenses/item-preview', {
          params: { path: { group_id: groupId } },
          body: body as { total_amount: string; items: ItemIn[] },
          signal,
        }),
      ),
  })
}

/** Attach the photo to an expense that was just created from it. */
export function useAttachReceipt(groupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ expenseId, file }: { expenseId: string; file: File }) =>
      unwrap<Expense>(
        api.PUT('/api/expenses/{expense_id}/receipt', {
          params: { path: { expense_id: expenseId } },
          ...multipart(file),
        }),
      ),
    onSuccess: (_, { expenseId }) => {
      void queryClient.invalidateQueries({ queryKey: qk.expenses.detail(expenseId) })
      void queryClient.invalidateQueries({ queryKey: qk.groups.detail(groupId) })
    },
  })
}
