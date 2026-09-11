import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { detailOf } from '@/api/errors'
import { AppBar } from '@/app/layouts/AppBar'
import { Avatar } from '@/components/Avatar'
import { Badge } from '@/components/Badge'
import { Button, LinkButton } from '@/components/Button'
import { Card } from '@/components/Card'
import { ListRow, ListSection } from '@/components/ListRow'
import { Money } from '@/components/Money'
import { Sheet } from '@/components/Sheet'
import { Spinner } from '@/components/Spinner'
import { ErrorState } from '@/components/feedback'
import { Page, Stack } from '@/components/layout'
import { useGroupScope } from '@/features/groups/groupContext'
import { formatDay, formatRelative } from '@/lib/dates'
import { categoryLabelOf, sourceLabel, splitTypeLabel } from '@/lib/labels'

import { useDeleteExpense, useExpense } from './api'

export function ExpenseDetailScreen() {
  const { expenseId } = useParams<{ expenseId: string }>()
  const navigate = useNavigate()
  const query = useExpense(expenseId)
  const { groupId, currency } = useGroupScope()
  const remove = useDeleteExpense(groupId)
  const [confirming, setConfirming] = useState(false)

  if (query.isLoading) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center">
        <Spinner size="lg" label="Loading the expense" />
      </div>
    )
  }
  if (query.isError || !query.data) {
    return (
      <Page width="narrow">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </Page>
    )
  }

  const expense = query.data

  return (
    <>
      <AppBar
        title={expense.title}
        back={`/groups/${groupId}`}
        actions={
          <LinkButton
            to={`/groups/${groupId}/expenses/${expense.id}/edit`}
            size="sm"
            variant="ghost"
          >
            Edit
          </LinkButton>
        }
      />

      <Page width="narrow">
        <Stack gap={5} className="py-4">
          <Card className="mx-4" elevated>
            <Stack gap={1} className="items-center py-2 text-center">
              <Money amount={expense.total_amount} currency={currency} size="display" />
              <p className="text-muted text-sm">
                {expense.payer.name} paid on {formatDay(expense.expense_date)}
              </p>
              <Stack direction="row" gap={2} className="mt-2 flex-wrap justify-center">
                <Badge>{categoryLabelOf(expense.category)}</Badge>
                <Badge tone="neutral">{splitTypeLabel[expense.split_type]}</Badge>
                {expense.source !== 'MANUAL' && (
                  <Badge tone="accent">{sourceLabel[expense.source]}</Badge>
                )}
              </Stack>
            </Stack>
          </Card>

          {expense.split_rule && (
            <p className="text-muted px-4 text-xs">
              Split by the group&rsquo;s standing rule &ldquo;{expense.split_rule.name}&rdquo;.
            </p>
          )}

          <ListSection header={`Who owes what (${expense.splits.length})`}>
            {expense.splits.map((split) => (
              <ListRow
                key={split.user.id}
                leading={<Avatar user={split.user} size="sm" />}
                title={split.user.name}
                subtitle={split.user.id === expense.payer.id ? 'Paid for this' : undefined}
                // These are the server's own numbers, allocated by largest
                // remainder. They are the only per-person amounts in the app
                // shown without a "≈".
                meta={<Money amount={split.owed_amount} currency={currency} />}
              />
            ))}
          </ListSection>

          <p className="text-muted px-4 text-xs">
            These add up to the total exactly. The odd cent goes to the largest remainder, so nobody
            is ever short-changed twice.
          </p>

          {expense.notes && (
            <div className="px-4">
              <p className="text-muted mb-1 text-xs font-semibold tracking-wide uppercase">Notes</p>
              <p className="text-base whitespace-pre-wrap">{expense.notes}</p>
            </div>
          )}

          <p className="text-muted px-4 text-xs">
            Added {formatRelative(expense.created_at)}
            {expense.updated_at !== expense.created_at &&
              `, edited ${formatRelative(expense.updated_at)}`}
            .
          </p>

          <div className="px-4">
            <Button variant="danger" fullWidth onClick={() => setConfirming(true)}>
              Delete this expense
            </Button>
          </div>
        </Stack>
      </Page>

      <Sheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete this expense?"
        description="It goes for everyone, and the balances change straight away. This cannot be undone."
        footer={
          <>
            <Button variant="secondary" fullWidth onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              fullWidth
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(expense.id, {
                  onSuccess: () => navigate(`/groups/${groupId}`, { replace: true }),
                })
              }
            >
              Delete
            </Button>
          </>
        }
      >
        <Stack gap={2}>
          <p className="text-sm">
            <span className="font-semibold">{expense.title}</span> &mdash;{' '}
            <Money amount={expense.total_amount} currency={currency} />, split between{' '}
            {expense.splits.length} {expense.splits.length === 1 ? 'person' : 'people'}.
          </p>
          {remove.isError && (
            <p role="alert" className="text-danger text-sm">
              {detailOf(remove.error)}
            </p>
          )}
        </Stack>
      </Sheet>
    </>
  )
}
