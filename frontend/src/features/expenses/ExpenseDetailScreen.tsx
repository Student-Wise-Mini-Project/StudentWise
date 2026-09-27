import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { detailOf } from '@/api/errors'
import { AppBar } from '@/app/layouts/AppBar'
import { Avatar, AvatarStack } from '@/components/Avatar'
import { Badge } from '@/components/Badge'
import { Button, LinkButton } from '@/components/Button'
import { ListRow, ListSection } from '@/components/ListRow'
import { Money } from '@/components/Money'
import { Sheet } from '@/components/Sheet'
import { Spinner } from '@/components/Spinner'
import { ErrorState } from '@/components/feedback'
import { Page, Stack } from '@/components/layout'
import { ExpenseAlerts } from '@/features/analytics/ExpenseAlerts'
import { useAuth } from '@/features/auth/authContext'
import { CommentThread } from '@/features/comments/CommentThread'
import { useGroupScope } from '@/features/groups/groupContext'
import { ReceiptSection } from '@/features/receipts/ReceiptSection'
import { cn } from '@/lib/cn'
import { formatDay, formatRelative } from '@/lib/dates'
import { useT } from '@/i18n/i18nContext'
import { categoryLabelOf, sourceLabel, splitTypeLabel } from '@/lib/labels'
import { formatMoney, subtract } from '@/lib/money'

import { useDeleteExpense, useExpense } from './api'

export function ExpenseDetailScreen() {
  const t = useT()
  const { expenseId } = useParams<{ expenseId: string }>()
  const navigate = useNavigate()
  const query = useExpense(expenseId)
  const { groupId, group, currency, activeMembers } = useGroupScope()
  const { user } = useAuth()
  const meId = user?.id
  const remove = useDeleteExpense(groupId)
  const [confirming, setConfirming] = useState(false)

  if (query.isLoading) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center">
        <Spinner size="lg" label={t('expenses.detail.loading')} />
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
  const mine = expense.splits.find((split) => split.user.id === meId)

  // Exact, from the server's own allocation: a subtraction, not a division. If
  // I paid, I am out the whole bill less my own share of it.
  const myPosition = mine
    ? expense.payer.id === meId
      ? { lent: true, amount: subtract(expense.total_amount, mine.owed_amount) }
      : { lent: false, amount: mine.owed_amount }
    : null

  return (
    <>
      <AppBar
        // The title lives in the body at 24px, so repeating it here would put
        // the same words twice on one screen an inch apart.
        title={<span className="sr-only">{expense.title}</span>}
        back={`/groups/${groupId}`}
        actions={
          <LinkButton
            to={`/groups/${groupId}/expenses/${expense.id}/edit`}
            size="sm"
            variant="ghost"
          >
            {t('common.actions.edit')}
          </LinkButton>
        }
      />

      <Page width="narrow">
        <Stack gap={5} className="pb-4">
          <header className="px-4 pt-1">
            <Stack direction="row" gap={2} className="flex-wrap">
              <Badge>{categoryLabelOf(t, expense.category)}</Badge>
              <Badge tone="neutral">{splitTypeLabel(t, expense.split_type)}</Badge>
              {expense.source !== 'MANUAL' && (
                <Badge tone="accent">{sourceLabel(t, expense.source)}</Badge>
              )}
            </Stack>

            <h1 className="font-display mt-2.5 text-2xl font-black tracking-tight" dir="auto">
              {expense.title}
            </h1>
            <p className="mt-1">
              <Money amount={expense.total_amount} currency={currency} size="hero" />
            </p>
            <p className="text-muted mt-1.5 text-sm" dir="auto">
              {expense.payer.id === meId
                ? t('expenses.detail.metaSelf', {
                    date: formatDay(expense.expense_date),
                    group: group.name,
                  })
                : t('expenses.detail.metaOther', {
                    name: expense.payer.name,
                    date: formatDay(expense.expense_date),
                    group: group.name,
                  })}
            </p>

            {/* Where the reader stands, as one filled pill. The list below has
             * everybody's share; this is the only line most people read. */}
            {myPosition && (
              <p
                className={cn(
                  'font-display mt-3 inline-block rounded-sm px-3 py-2 text-sm font-extrabold',
                  myPosition.lent ? 'bg-credit-soft text-credit' : 'bg-debt-soft text-debt',
                )}
              >
                {myPosition.lent ? t('expenses.detail.youLent') : t('expenses.detail.youOwe')}{' '}
                <Money
                  amount={myPosition.amount}
                  currency={currency}
                  size="sm"
                  className="text-inherit"
                />
              </p>
            )}
          </header>

          <ExpenseAlerts expenseId={expense.id} />

          {expense.split_rule && (
            <p className="text-muted px-4 text-xs">
              {t('expenses.detail.splitRule', { name: expense.split_rule.name })}
            </p>
          )}

          <ListSection
            header={t('expenses.detail.splitHeader', {
              splitType: splitTypeLabel(t, expense.split_type),
              count: expense.splits.length,
            })}
          >
            {expense.splits.map((split) => (
              <ListRow
                key={split.user.id}
                leading={<Avatar user={split.user} size="sm" />}
                title={
                  <>
                    {split.user.id === meId ? t('common.state.you') : split.user.name}
                    {split.user.id === expense.payer.id && (
                      <span className="text-faint font-normal">
                        {t('expenses.detail.paidMarker')}
                      </span>
                    )}
                  </>
                }
                // These are the server's own numbers, allocated by largest
                // remainder. They are the only per-person amounts in the app
                // shown without a "≈".
                meta={<Money amount={split.owed_amount} currency={currency} size="lg" />}
              />
            ))}
          </ListSection>

          <p className="text-muted px-4 text-xs">{t('expenses.detail.roundingNote')}</p>

          {expense.items.length > 0 && (
            <ListSection header={t('scan.detail.linesHeader')}>
              {expense.items.map((item) => (
                <ListRow
                  key={item.id}
                  dense
                  title={<bdi>{item.name}</bdi>}
                  subtitle={
                    // Stored with everyone named when nobody was marked, so
                    // "the whole group" is recognised rather than listed.
                    item.users.length === activeMembers.length ? (
                      t('scan.detail.everyone')
                    ) : (
                      <AvatarStack users={item.users} size="sm" max={6} className="mt-1" />
                    )
                  }
                  meta={<Money amount={item.amount} currency={currency} size="md" />}
                />
              ))}
            </ListSection>
          )}
          {expense.items.length > 0 && (
            <p className="text-muted px-4 text-xs">{t('scan.detail.linesNote')}</p>
          )}

          {expense.notes && (
            <div className="px-4">
              <p className="text-muted font-display text-2xs mb-1 font-extrabold tracking-widest uppercase">
                {t('expenses.detail.notes')}
              </p>
              <p className="text-base whitespace-pre-wrap">{expense.notes}</p>
            </div>
          )}

          <ReceiptSection
            groupId={groupId}
            expenseId={expense.id}
            hasReceipt={expense.receipt_url !== null}
          />

          <CommentThread expenseId={expense.id} />

          <p className="text-muted px-4 text-xs">
            {t('expenses.detail.added', { when: formatRelative(expense.created_at) })}
            {expense.updated_at !== expense.created_at &&
              t('expenses.detail.edited', { when: formatRelative(expense.updated_at) })}
            .
          </p>

          <div className="px-4">
            <Button variant="danger" fullWidth onClick={() => setConfirming(true)}>
              {t('expenses.detail.delete')}
            </Button>
          </div>
        </Stack>
      </Page>

      <Sheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('expenses.detail.confirmTitle')}
        description={t('expenses.detail.confirmBody')}
        footer={
          <>
            <Button variant="secondary" fullWidth onClick={() => setConfirming(false)}>
              {t('expenses.detail.confirmKeep')}
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
              {t('common.actions.delete')}
            </Button>
          </>
        }
      >
        <Stack gap={2}>
          <p className="text-sm">
            {/* One sentence with an amount inside it. The catalogue holds the
             * whole sentence with a {amount} placeholder and the formatted
             * money is substituted in, rather than the sentence being built
             * from three JSX fragments that no translator could reorder. */}
            {t('expenses.detail.confirmSummary', {
              title: expense.title,
              amount: formatMoney(expense.total_amount, currency),
              count: expense.splits.length,
            })}
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
