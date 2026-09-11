import { useMemo } from 'react'
import { NavLink, Outlet, useParams } from 'react-router'

import { AppBar } from '@/app/layouts/AppBar'
import { Spinner } from '@/components/Spinner'
import { ErrorState } from '@/components/feedback'
import { Page } from '@/components/layout'
import { useAuth } from '@/features/auth/authContext'
import { useRunDueBillsOnce } from '@/features/recurring/api'
import { cn } from '@/lib/cn'

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
  { to: 'members', label: 'People' },
]

/** The group's own chrome: its name, and the three things you can look at. */
export function GroupTabsLayout() {
  const { group } = useGroupScope()

  return (
    <>
      <AppBar title={group.name} back="/groups" />
      <Page width="narrow">
        <nav className="border-line flex gap-1 border-b px-2" aria-label="Group sections">
          {TABS.map((tab) => (
            <NavLink
              key={tab.label}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  'relative px-3 py-3 text-sm font-semibold transition-colors',
                  isActive ? 'text-accent' : 'text-muted hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {tab.label}
                  {isActive && (
                    <span className="bg-accent absolute inset-x-2 bottom-0 h-0.5 rounded-full" />
                  )}
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
