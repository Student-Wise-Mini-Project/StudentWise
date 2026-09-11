import { Link } from 'react-router'

import type { ActivityItem } from '@/api/types'
import { AppBar } from '@/app/layouts/AppBar'
import { Avatar } from '@/components/Avatar'
import { InfiniteList } from '@/components/InfiniteList'
import { ListRow, ListSection } from '@/components/ListRow'
import { Money } from '@/components/Money'
import { Slab, SlabChip } from '@/components/Slab'
import { EmptyState, Skeleton } from '@/components/feedback'
import { BellIcon, ChevronEnd, GroupsIcon, TransferIcon } from '@/components/icons'
import { Page } from '@/components/layout'
import { useAuth } from '@/features/auth/authContext'
import { useGroups } from '@/features/groups/api'
import { useUnreadCount } from '@/features/notifications/api'
import { cn } from '@/lib/cn'
import { formatDayHeader } from '@/lib/dates'
import { useT } from '@/i18n/i18nContext'
import { groupTypeLabel } from '@/lib/labels'
import { abs, addAll, compare, isPositive, isZero, subtract } from '@/lib/money'

import { useActivityFeed, useOverallPosition } from './api'

export function HomeScreen() {
  const t = useT()
  const { user } = useAuth()
  const groups = useGroups()
  const feed = useActivityFeed()
  const position = useOverallPosition(groups.data, user?.id)
  const unread = useUnreadCount().data?.unread ?? 0

  return (
    <>
      <AppBar
        title={<span className="text-2xl font-black tracking-[-0.02em]">Activity</span>}
        actions={
          <Link
            to="/notifications"
            aria-label={unread > 0 ? `Alerts, ${unread} unread` : 'Alerts'}
            className="text-ink hover:bg-sunken relative rounded-md p-2 transition-colors"
          >
            <BellIcon className="size-6" />
            {unread > 0 && (
              // A dot, not a count: the tab bar already carries the number, and
              // this only has to say "something is waiting".
              <span className="bg-debt border-ground absolute end-1.5 top-1.5 size-2 rounded-sm border" />
            )}
          </Link>
        }
      />

      {/* One column on a phone, two from `lg`. The second is not a stretched
       * phone: it holds the slab and the group list so the balance stays on
       * screen the whole time the feed is being read, which is the only thing
       * the extra width is actually good for. The slab leads in the DOM so it
       * is still the first thing read on a phone and by a screen reader. */}
      <Page width="wide" className="lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-8 lg:px-6">
        <div className="lg:col-start-2 lg:row-start-1">
          <div className="lg:sticky lg:top-20">
            <Position loading={position.loading || groups.isLoading} perGroup={position.perGroup} />
            {(groups.data?.length ?? 0) > 0 && (
              <div className="hidden lg:block">
                <ListSection header="Your groups">
                  {(groups.data ?? []).map((group) => (
                    <ListRow
                      key={group.id}
                      to={`/groups/${group.id}`}
                      title={group.name}
                      subtitle={groupTypeLabel(t, group.type)}
                      trailing={<ChevronEnd />}
                      dense
                    />
                  ))}
                </ListSection>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-start-1 lg:row-start-1 lg:max-w-[37.5rem]">
          {groups.data?.length === 0 ? (
            <EmptyState
              icon={<GroupsIcon className="size-5" />}
              title="Nothing here yet"
              body="Start with a group — a flat, a trip, or the two of you."
              action={{ label: 'Create a group', to: '/groups' }}
            />
          ) : (
            <InfiniteList
              query={feed}
              renderItem={(item: ActivityItem, index) => {
                // Grouped by day, with the header sitting on the ground rather
                // than on a surface -- the bands below it are the surface, and a
                // header inside one would read as another row.
                const previous = feed.items[index - 1]
                const day = formatDayHeader(item.occurred_at)
                const opensDay = !previous || formatDayHeader(previous.occurred_at) !== day
                return (
                  <div key={`${item.occurred_at}-${index}`}>
                    {opensDay && (
                      <h2 className="text-muted font-display text-2xs px-4 pt-5 pb-2 font-extrabold tracking-[0.1em] uppercase">
                        {day}
                      </h2>
                    )}
                    <div
                      className={cn(
                        'bg-surface border-line border-b',
                        opensDay && 'border-t',
                        item.kind === 'SETTLEMENT_RECORDED' && 'bg-credit-soft',
                      )}
                    >
                      <ActivityRow item={item} meId={user?.id} />
                    </div>
                  </div>
                )
              }}
              empty={
                <EmptyState
                  title="Nothing has happened yet"
                  body="Add an expense and it will show up here."
                  size="inline"
                />
              }
            />
          )}
        </div>
      </Page>
    </>
  )
}

/**
 * "Am I up or down, and by how much" — the screen's one slab.
 *
 * Nets are totalled **per currency**, never as one number. Groups can be in
 * different currencies and the backend deliberately refuses to convert between
 * them; adding shekels to euros here would invent an exchange rate the rest of
 * the app is careful not to have. So the slab carries the currency the user has
 * most at stake in, and says plainly that the others are not folded into it.
 */
function Position({
  loading,
  perGroup,
}: {
  loading: boolean
  perGroup: { groupId: string; name: string; currency: string; net: string }[]
}) {
  if (loading) {
    return (
      <Slab eyebrow="Overall">
        <Skeleton className="mt-2 h-11 w-48" />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Skeleton className="h-12" rounded="md" />
          <Skeleton className="h-12" rounded="md" />
        </div>
      </Slab>
    )
  }

  const byCurrency = new Map<string, string[]>()
  for (const entry of perGroup) {
    byCurrency.set(entry.currency, [...(byCurrency.get(entry.currency) ?? []), entry.net])
  }

  const totals = [...byCurrency.entries()]
    .map(([currency, nets]) => ({ currency, net: addAll(nets) }))
    .filter((total) => !isZero(total.net))
    // Biggest stake first, so the slab carries the number that matters most.
    .sort((a, b) => compare(abs(b.net), abs(a.net)))

  const headline = totals[0]

  if (!headline) {
    return (
      <Slab eyebrow="Overall">
        <p className="font-display mt-1.5 text-4xl font-black tracking-[-0.03em]">
          Everyone is square.
        </p>
        <p className="text-faint mt-2 text-sm">Nothing owed either way.</p>
      </Slab>
    )
  }

  // Only the groups still carrying something, biggest first. A chip reading
  // "settled" is a row of nothing, and there is room for four.
  const chips = perGroup
    .filter((entry) => !isZero(entry.net))
    .sort((a, b) => compare(abs(b.net), abs(a.net)))
    .slice(0, 4)

  return (
    <Slab eyebrow={isPositive(headline.net) ? "Overall you're owed" : 'Overall you owe'}>
      <p className="mt-1.5">
        <Money
          amount={headline.net}
          currency={headline.currency}
          size="hero"
          className={isPositive(headline.net) ? 'text-slab-credit' : 'text-slab-debt'}
        />
      </p>

      {chips.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {chips.map((entry) => (
            <SlabChip key={entry.groupId} label={entry.name}>
              <Money
                amount={entry.net}
                currency={entry.currency}
                size="sm"
                className={isPositive(entry.net) ? 'text-slab-credit' : 'text-slab-debt'}
              />
            </SlabChip>
          ))}
        </div>
      )}

      {totals.length > 1 && (
        <p className="text-faint mt-3 text-xs" dir="auto">
          {totals.length - 1} other {totals.length === 2 ? 'currency is' : 'currencies are'} not
          added in — they are shown per group.
        </p>
      )}
    </Slab>
  )
}

/**
 * A feed row.
 *
 * An expense and a payment are deliberately not flattened into one shape.
 * "Maya added Supermarket" is news about spending, and gets a face and a heavy
 * amount; "Noa paid you" is news about a debt going away, and gets a quiet
 * tinted band with no avatar and no big number. Scrolling past, the two should
 * be told apart before either is read.
 */
function ActivityRow({ item, meId }: { item: ActivityItem; meId: string | undefined }) {
  if (item.kind === 'EXPENSE_ADDED' && item.expense) {
    const expense = item.expense
    const iPaid = expense.payer.id === meId
    const mine = expense.splits.find((split) => split.user.id === meId)

    // Exact, from the server's own allocation -- a subtraction, not a division.
    // If I paid, I am out the whole bill less my own share of it.
    const position = mine
      ? iPaid
        ? { word: 'you lent', amount: subtract(expense.total_amount, mine.owed_amount) }
        : { word: 'you owe', amount: mine.owed_amount }
      : null

    return (
      <ListRow
        to={`/groups/${item.group_id}/expenses/${expense.id}`}
        leading={<Avatar user={expense.payer} />}
        title={expense.title}
        subtitle={`${iPaid ? 'You' : expense.payer.name} paid · ${item.group_name}`}
        meta={<Money amount={expense.total_amount} currency={item.currency} size="lg" />}
        metaSubtitle={
          position ? (
            <span className={cn('text-xs font-semibold', iPaid ? 'text-credit' : 'text-debt')}>
              {position.word}{' '}
              <Money
                amount={position.amount}
                currency={item.currency}
                size="sm"
                className="text-inherit"
              />
            </span>
          ) : (
            'not on this one'
          )
        }
      />
    )
  }

  if (item.kind === 'SETTLEMENT_RECORDED' && item.settlement) {
    const settlement = item.settlement
    const from = settlement.from_user.id === meId ? 'You' : settlement.from_user.name
    const to = settlement.to_user.id === meId ? 'you' : settlement.to_user.name

    return (
      <div className="text-credit flex items-center gap-2.5 px-4 py-2.5">
        <TransferIcon className="size-5 shrink-0" />
        {/* dir="auto" keeps an English sentence's full stop at its own end when
         * the shell around it is right-to-left. */}
        <p className="min-w-0 flex-1 truncate text-sm" dir="auto">
          {from} paid {to} · {item.group_name}
        </p>
        <Money amount={settlement.amount} currency={item.currency} size="sm" tone="credit" />
      </div>
    )
  }

  return null
}
