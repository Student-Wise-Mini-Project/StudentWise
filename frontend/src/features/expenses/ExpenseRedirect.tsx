import { Navigate, useLocation, useParams } from 'react-router'

import { Spinner } from '@/components/Spinner'
import { ErrorState } from '@/components/feedback'
import { Page } from '@/components/layout'

import { useExpense } from './api'
import { useT } from '@/i18n/i18nContext'

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
  const t = useT()
  const { expenseId } = useParams<{ expenseId: string }>()
  const location = useLocation()
  const query = useExpense(expenseId)

  if (query.isLoading) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center">
        <Spinner size="lg" label={t('expenses.redirect.loading')} />
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <Page width="narrow">
        <ErrorState title={t('expenses.redirect.error')} error={query.error} />
      </Page>
    )
  }

  // Forward the router state: it says where the person came from, and the
  // expense's back arrow needs it.
  return (
    <Navigate
      to={`/groups/${query.data.group_id}/expenses/${query.data.id}`}
      state={location.state}
      replace
    />
  )
}
