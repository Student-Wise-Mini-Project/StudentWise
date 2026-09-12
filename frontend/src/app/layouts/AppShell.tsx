import { Link, Outlet, useMatch } from 'react-router'

import { OfflineBanner } from '@/components/OfflineBanner'
import { useT } from '@/i18n/i18nContext'
import { PlusIcon } from '@/components/icons'
import { useGroups } from '@/features/groups/api'
import { useUnreadCount } from '@/features/notifications/api'
import { IosInstallHint, UpdatePrompt } from '@/pwa/PwaPrompts'

import { SideNav } from './SideNav'
import { TabBar } from './TabBar'

/**
 * One shell, two chromes.
 *
 * Below `lg` this is a bottom tab bar and a floating action button; at `lg` and
 * above it is a persistent sidebar. Same components, same routes, CSS decides --
 * a separate mobile route tree would double every screen's mount logic and
 * guarantee the two drift apart.
 */
export function AppShell() {
  // Fetched here, once, and shared by both navigations. Fetching it inside each
  // of them would double the request and let the two disagree mid-refresh.
  const t = useT()
  const unread = useUnreadCount()
  const unreadCount = unread.data?.unread ?? 0

  // The bar is on every screen, so it has to read the screen. Inside a group it
  // opens that group's form; everywhere else there is no group to add to yet, so
  // it goes to the list to pick one.
  const inGroup = useMatch('/groups/:groupId/*')
  const groupId = inGroup?.params.groupId
  const addExpenseTo = groupId ? `/groups/${groupId}/expenses/new` : '/groups'

  // ...and on the form itself it would point at the page it is already on, over
  // a screen whose whole job is to be finished or cancelled.
  const onNewExpense = useMatch('/groups/:groupId/expenses/new')
  const onEditExpense = useMatch('/groups/:groupId/expenses/:expenseId/edit')
  const onEditor = Boolean(onNewExpense ?? onEditExpense)

  // A closed group takes no new expenses, so it is not offered one. The group
  // list is already in cache from the screens that use it; this shell sits
  // above `GroupScopeRoute` and so has no scope of its own to read.
  const groups = useGroups()
  const inClosedGroup = Boolean(
    groupId && groups.data?.some((group) => group.id === groupId && group.archived_at !== null),
  )

  return (
    <div className="min-h-dvh lg:ps-60">
      <OfflineBanner />
      <SideNav unreadCount={unreadCount} />

      <main
        className="pb-20 lg:pb-8"
        // Clear the tab bar, the FAB bar above it *and* the home indicator, so
        // the last row of a list is never stuck behind any of them.
        style={{
          paddingBlockEnd: 'calc(var(--sw-tabbar-height) + var(--sw-safe-block-end) + 4.5rem)',
        }}
      >
        <Outlet />
      </main>

      {/* A bar, not a disc. A circle in the corner hides its own label and a
       * right-to-left reader has to learn a new corner; a full-width pill says
       * what it does, is reachable by either thumb, and mirrors for free. The
       * `+` is its own flex child so it stays on the leading edge under `rtl`
       * rather than being swept to the end of the text run. */}
      {!onEditor && !inClosedGroup && (
        <div
          className="from-ground pointer-events-none fixed inset-x-0 z-30 bg-linear-to-t from-45% to-transparent px-4 pt-12 pb-2 lg:hidden"
          style={{ insetBlockEnd: 'calc(var(--sw-tabbar-height) + var(--sw-safe-block-end))' }}
        >
          <Link
            to={addExpenseTo}
            className="bg-accent text-on-accent shadow-float font-display pointer-events-auto mx-auto flex h-13 max-w-2xl items-center justify-center gap-2 rounded-full text-lg font-extrabold transition-transform active:scale-[0.98]"
          >
            <PlusIcon className="size-5" />
            {t('common.shell.addExpense')}
          </Link>
        </div>
      )}

      <TabBar unreadCount={unreadCount} />

      <UpdatePrompt />
      <IosInstallHint />
    </div>
  )
}
