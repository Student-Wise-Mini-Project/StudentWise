import { Navigate, useParams } from 'react-router'

import { Spinner } from '@/components/Spinner'
import { ErrorState } from '@/components/feedback'
import { Page } from '@/components/layout'

import { useExpense } from './api'

/**
 * Resolves a bare `/expenses/:id` link to its group-scoped route.
 *
 * The API's expense route is flat, and both the cross-group activity feed and
 * notifications link to an expense without necessarily knowing which group it is
 * in. Rather than force a group id into those links -- which would mean the feed
 * carrying data it does not need -- this fetches the expense once and redirects
 * to `/groups/{group_id}/expenses/{id}`, where the group's members and currency
 * are in scope.
 */
export function ExpenseRedirect() {
  const { expenseId } = useParams<{ expenseId: string }>()
  const query = useExpense(expenseId)

  if (query.isLoading) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center">
        <Spinner size="lg" label="Opening the expense" />
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <Page width="narrow">
        <ErrorState title="Cannot open that expense" error={query.error} />
      </Page>
    )
  }

  return <Navigate to={`/groups/${query.data.group_id}/expenses/${query.data.id}`} replace />
}
