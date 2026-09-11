import type { ActivityItem } from '@/api/types'
import { AppBar } from '@/app/layouts/AppBar'
import { Avatar } from '@/components/Avatar'
import { Card } from '@/components/Card'
import { InfiniteList } from '@/components/InfiniteList'
import { ListRow } from '@/components/ListRow'
import { Money } from '@/components/Money'
import { EmptyState, Skeleton } from '@/components/feedback'
import { GroupsIcon } from '@/components/icons'
import { Page, Stack } from '@/components/layout'
import { useAuth } from '@/features/auth/authContext'
import { useGroups } from '@/features/groups/api'
import { addAll, isPositive, isZero } from '@/lib/money'
import { formatRelative } from '@/lib/dates'

import { useActivityFeed, useOverallPosition } from './api'

export function HomeScreen() {
  const { user } = useAuth()
  const groups = useGroups()
  const feed = useActivityFeed()
  const position = useOverallPosition(groups.data, user?.id)

  return (
    <>
      <AppBar title={user ? `Hello, ${user.name.split(' ')[0]}` : 'StudentWise'} />

      <Page width="narrow">
        <PositionCard loading={position.loading || groups.isLoading} perGroup={position.perGroup} />

        {groups.data?.length === 0 ? (
          <EmptyState
            icon={<GroupsIcon className="size-10" />}
            title="Nothing here yet"
            body="Start with a group — a flat, a trip, or the two of you."
            action={{ label: 'Create a group', to: '/groups' }}
          />
        ) : (
          <>
            <h2 className="text-muted px-4 pt-5 pb-2 text-xs font-semibold tracking-wide uppercase">
              Recent
            </h2>
            <InfiniteList
              query={feed}
              renderItem={(item: ActivityItem, index) => (
                <ActivityRow key={`${item.occurred_at}-${index}`} item={item} meId={user?.id} />
              )}
              empty={
                <EmptyState
                  title="Nothing has happened yet"
                  body="Add an expense and it will show up here."
                  size="inline"
                />
              }
            />
          </>
        )}
      </Page>
    </>
  )
}

/**
 * "Am I up or down, and by how much."
 *
 * Nets are shown **per currency**, never as one number. Groups can be in
 * different currencies and the backend deliberately refuses to convert between
 * them -- adding shekels to euros here would invent an exchange rate the rest of
 * the app is careful not to have.
 */
function PositionCard({
  loading,
  perGroup,
}: {
  loading: boolean
  perGroup: { currency: string; net: string }[]
}) {
  if (loading) {
    return (
      <Card className="mx-4 mt-4">
        <Stack gap={2} className="items-center py-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-36" />
        </Stack>
      </Card>
    )
  }

  const byCurrency = new Map<string, string[]>()
  for (const entry of perGroup) {
    byCurrency.set(entry.currency, [...(byCurrency.get(entry.currency) ?? []), entry.net])
  }

  const totals = [...byCurrency.entries()]
    .map(([currency, nets]) => ({ currency, net: addAll(nets) }))
    .filter((total) => !isZero(total.net))

  if (totals.length === 0) {
    return (
      <Card className="mx-4 mt-4">
        <p className="text-muted py-4 text-center text-base font-medium">
          You are all square. Nothing owed either way.
        </p>
      </Card>
    )
  }

  return (
    <Card className="mx-4 mt-4">
      <Stack gap={3} className="py-2">
        {totals.map((total) => (
          <Stack key={total.currency} gap={1} className="items-center text-center">
            <p className="text-muted text-sm font-medium">
              {isPositive(total.net) ? 'You are owed' : 'You owe'}
            </p>
            <Money amount={total.net} currency={total.currency} tone="auto" size="display" />
          </Stack>
        ))}
        {totals.length > 1 && (
          <p className="text-muted text-center text-xs">
            Shown per currency — these are not added together.
          </p>
        )}
      </Stack>
    </Card>
  )
}

/**
 * A feed row.
 *
 * An expense and a payment read very differently and are deliberately not
 * flattened into one shape: "Maya added Supermarket" is news about spending,
 * "Gal paid Maya" is news about a debt going away.
 */
function ActivityRow({ item, meId }: { item: ActivityItem; meId: string | undefined }) {
  if (item.kind === 'EXPENSE_ADDED' && item.expense) {
    const expense = item.expense
    const mine = expense.splits.find((split) => split.user.id === meId)
    return (
      <ListRow
        to={`/groups/${item.group_id}/expenses/${expense.id}`}
        leading={<Avatar user={expense.payer} />}
        title={expense.title}
        subtitle={`${expense.payer.id === meId ? 'You' : expense.payer.name} paid · ${item.group_name}`}
        meta={<Money amount={expense.total_amount} currency={item.currency} size="lg" />}
        metaSubtitle={
          mine ? (
            <>
              your share <Money amount={mine.owed_amount} currency={item.currency} size="sm" />
            </>
          ) : (
            'not on this one'
          )
        }
      />
    )
  }

  if (item.kind === 'SETTLEMENT_RECORDED' && item.settlement) {
    const settlement = item.settlement
    return (
      <ListRow
        leading={<Avatar user={settlement.from_user} />}
        title={
          <>
            {settlement.from_user.id === meId ? 'You' : settlement.from_user.name} paid{' '}
            {settlement.to_user.id === meId ? 'you' : settlement.to_user.name}
          </>
        }
        subtitle={`${item.group_name} · ${formatRelative(item.occurred_at)}`}
        meta={<Money amount={settlement.amount} currency={item.currency} tone="credit" size="lg" />}
        metaSubtitle="settled up"
      />
    )
  }

  return null
}
