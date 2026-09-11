import { useMutation, useQueryClient } from '@tanstack/react-query'

import { api, unwrap } from '@/api/client'
import { usePagedQuery } from '@/api/paged'
import { qk } from '@/api/queryKeys'
import type { Comment, Page } from '@/api/types'

/**
 * A thread, oldest first.
 *
 * The only ascending list in the API, and deliberately so: a conversation reads
 * from the top down, a feed does not.
 */
export function useComments(expenseId: string) {
  return usePagedQuery<Comment>({
    queryKey: qk.expenses.comments(expenseId),
    limit: 50,
    fetchPage: ({ limit, offset, signal }) =>
      unwrap<Page<Comment>>(
        api.GET('/api/expenses/{expense_id}/comments', {
          params: { path: { expense_id: expenseId }, query: { limit, offset } },
          signal,
        }),
      ),
  })
}

export function useAddComment(expenseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: string) =>
      unwrap<Comment>(
        api.POST('/api/expenses/{expense_id}/comments', {
          params: { path: { expense_id: expenseId } },
          body: { body },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.expenses.comments(expenseId) })
    },
  })
}

export function useEditComment(expenseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
      unwrap<Comment>(
        api.PATCH('/api/comments/{comment_id}', {
          params: { path: { comment_id: commentId } },
          body: { body },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.expenses.comments(expenseId) })
    },
  })
}

export function useDeleteComment(expenseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (commentId: string) =>
      unwrap<void>(
        api.DELETE('/api/comments/{comment_id}', { params: { path: { comment_id: commentId } } }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.expenses.comments(expenseId) })
    },
  })
}
