import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/api/client'
import { ApiError, parseDetail } from '@/api/errors'
import { qk } from '@/api/queryKeys'
import type { Expense } from '@/api/types'
import { getToken } from '@/features/auth/authStore'
import { env } from '@/lib/env'

/**
 * Receipts cannot be pointed at with `<img src>`.
 *
 * `GET /api/expenses/{id}/receipt` requires the `Authorization` header -- a
 * receipt shows what someone bought and where they were, so it is served by an
 * authorised endpoint rather than off a static path. An `<img>` tag cannot send
 * a header, so the bytes are fetched and turned into an object URL.
 *
 * The URL is the query's data, which means two components showing the same
 * receipt share one fetch and one URL. Revocation hangs off the query cache
 * being garbage-collected (see `registerReceiptCleanup`), **not** off a
 * component unmounting: two mounted images for one expense would otherwise
 * revoke each other's URL and one of them would go blank.
 */
const RECEIPT_NOT_FOUND = Symbol('no receipt')

async function fetchReceiptUrl(expenseId: string, signal: AbortSignal) {
  const response = await fetch(`${env.API_URL}/api/expenses/${expenseId}/receipt`, {
    headers: { Authorization: `Bearer ${getToken() ?? ''}` },
    signal,
  })
  if (response.status === 404) return RECEIPT_NOT_FOUND
  if (!response.ok) throw new ApiError(response.status, parseDetail(undefined, response.status))
  return URL.createObjectURL(await response.blob())
}

export function useReceiptBlob(expenseId: string, hasReceipt: boolean) {
  const query = useQuery({
    queryKey: qk.expenses.receipt(expenseId),
    enabled: hasReceipt,
    // The bytes never change under a given URL -- a replacement busts the cache
    // explicitly in the mutations below.
    staleTime: Infinity,
    retry: false,
    queryFn: ({ signal }) => fetchReceiptUrl(expenseId, signal),
  })

  if (!hasReceipt || query.data === RECEIPT_NOT_FOUND) return { status: 'none' } as const
  if (query.isLoading) return { status: 'loading' } as const
  if (query.isError) return { status: 'error', error: query.error } as const
  if (typeof query.data === 'string') return { status: 'ready', url: query.data } as const
  return { status: 'loading' } as const
}

/**
 * Revoke object URLs when their cache entry is dropped.
 *
 * Called once with the app's QueryClient. Without it every receipt viewed in a
 * session stays in memory until the tab closes -- which on a phone, in an app
 * whose whole point is photographing receipts, adds up.
 */
export function registerReceiptCleanup(queryClient: ReturnType<typeof useQueryClient>): () => void {
  return queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'removed') return
    const key = event.query.queryKey
    if (key[0] !== 'expenses' || key[3] !== 'receipt') return
    const url = event.query.state.data
    if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url)
  })
}

/** Drop a cached image immediately, when the receipt behind it has changed. */
function forget(queryClient: ReturnType<typeof useQueryClient>, expenseId: string): void {
  const key = qk.expenses.receipt(expenseId)
  const url = queryClient.getQueryData(key)
  if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url)
  queryClient.removeQueries({ queryKey: key })
}

export function useUploadReceipt(groupId: string, expenseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      const body = new FormData()
      body.append('file', file)
      return unwrap<Expense>(
        api.PUT('/api/expenses/{expense_id}/receipt', {
          params: { path: { expense_id: expenseId } },
          // The generated type describes the multipart body as `{ file: string }`,
          // which is all OpenAPI can express for a binary upload. What has to go
          // on the wire is FormData, so the cast is deliberate and confined here.
          body: body as unknown as { file: string },
          // Pass it through untouched -- the browser sets the multipart boundary
          // itself, and it can only do that if we send no Content-Type.
          bodySerializer: (value: unknown) => value as BodyInit,
        }),
      )
    },
    onSuccess: () => {
      // A replacement reuses the same URL, so the old bytes have to go.
      forget(queryClient, expenseId)
      void queryClient.invalidateQueries({ queryKey: qk.expenses.detail(expenseId) })
      void queryClient.invalidateQueries({ queryKey: qk.groups.detail(groupId) })
    },
  })
}

export function useDeleteReceipt(groupId: string, expenseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      unwrap<Expense>(
        api.DELETE('/api/expenses/{expense_id}/receipt', {
          params: { path: { expense_id: expenseId } },
        }),
      ),
    onSuccess: () => {
      forget(queryClient, expenseId)
      void queryClient.invalidateQueries({ queryKey: qk.expenses.detail(expenseId) })
      void queryClient.invalidateQueries({ queryKey: qk.groups.detail(groupId) })
    },
  })
}
