import { useMemo } from 'react'
import { NavLink, Outlet, useParams } from 'react-router'

import { AppBar } from '@/app/layouts/AppBar'
import { AvatarStack } from '@/components/Avatar'
import { Money } from '@/components/Money'
import { Spinner } from '@/components/Spinner'
import { ErrorState, Skeleton } from '@/components/feedback'
import { Page } from '@/components/layout'
import { useAuth } from '@/features/auth/authContext'
import { useBalances } from '@/features/balances/api'
import { useRunDueBillsOnce } from '@/features/recurring/api'
import { cn } from '@/lib/cn'
import { isPositive, isZero } from '@/lib/money'

import { useGroup } from './api'
import { GroupContext, type GroupScope, useGroupScope } from './groupContext'

/**
 * Fetches the group once and provides it to everything beneath.
 *
 * Deliberately renders **no chrome**. Scope and chrome are separate because the
 * expense editor and the expense detail screen need the group's members and
 * currency but must not sit inside the group's tab bar -- a full-screen form
 * under a row of tabs reads as a mistake.
 */
export function GroupScopeRoute() {
  const { groupId } = useParams<{ groupId: string }>()
  const { user } = useAuth()
  const query = useGroup(groupId)

  // Nothing runs on a scheduler, so opening a group is what posts the rent.
  useRunDueBillsOnce(groupId)

  const scope = useMemo<GroupScope | null>(() => {
    if (!query.data || !groupId) return null
    const allMembers = query.data.members
    const activeMembers = allMembers.filter((member) => member.left_at === null)
    const me = allMembers.find((member) => member.user.id === user?.id)
    return {
      group: query.data,
      groupId,
      currency: query.data.currency,
      activeMembers,
      allMembers,
      me,
      isOwner: me?.role === 'OWNER',
    }
  }, [query.data, groupId, user?.id])

  if (query.isLoading) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center">
        <Spinner size="lg" label="Loading the group" />
      </div>
    )
  }

  if (query.isError || !scope) {
    return (
      <Page width="narrow">
        <ErrorState
          title="Cannot open that group"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      </Page>
    )
  }

  return (
    <GroupContext value={scope}>
      <Outlet />
    </GroupContext>
  )
}

const TABS = [
  { to: '', label: 'Expenses', end: true },
  { to: 'balances', label: 'Balances' },
  { to: 'members', label: 'Members' },
  { to: 'insights', label: 'Insights' },
]

/** The group's own chrome: its name, where you stand in it, and the four views. */
export function GroupTabsLayout() {
  const { group, groupId, activeMembers } = useGroupScope()
  const { user } = useAuth()
  const balances = useBalances(groupId)
  const mine = balances.data?.balances.find((row) => row.user.id === user?.id)

  return (
    <>
      <AppBar title={group.name} back="/groups" />
      <Page width="narrow">
        {/* A surface strip, not a slab. The Balances tab below carries this
         * screen's one inverted block, and two of them on the same screen
         * would be two headlines competing. */}
        <div className="bg-surface border-line flex items-center gap-4 border-b px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-muted font-display text-2xs font-extrabold tracking-[0.1em] uppercase">
              {mine && !isZero(mine.net)
                ? isPositive(mine.net)
                  ? "You're owed here"
                  : 'You owe here'
                : 'Your position here'}
            </p>
            <p className="mt-0.5">
              {balances.isLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : mine && !isZero(mine.net) ? (
                <Money
                  amount={mine.net}
                  currency={group.currency}
                  tone="auto"
                  className="text-3xl tracking-[-0.025em]"
                />
              ) : (
                <span className="font-display text-xl font-extrabold">Square</span>
              )}
            </p>
          </div>
          <AvatarStack users={activeMembers.map((member) => member.user)} size="sm" />
        </div>

        <nav className="border-line flex gap-1 border-b px-2" aria-label="Group sections">
          {TABS.map((tab) => (
            <NavLink
              key={tab.label}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  // Weight and colour carry the active state; the underline is
                  // a third signal, not the only one. A marker that moves is a
                  // marker that means something different once the bar mirrors.
                  'font-display relative px-3 py-3 text-sm transition-colors',
                  isActive ? 'text-accent font-extrabold' : 'text-muted hover:text-ink font-bold',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {tab.label}
                  {isActive && <span className="bg-accent absolute inset-x-2 bottom-0 h-0.5" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <Outlet />
      </Page>
    </>
  )
}
