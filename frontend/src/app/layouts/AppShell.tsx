import { useState } from 'react'
import { Link, Outlet, useMatch } from 'react-router'

import { OfflineBanner } from '@/components/OfflineBanner'
import { useT } from '@/i18n/i18nContext'
import { PlusIcon } from '@/components/icons'
import { useGroups } from '@/features/groups/api'
import { GroupPickerSheet } from '@/features/groups/GroupPickerSheet'
import { isGroupOpen } from '@/features/groups/lifecycle'
import { openGroupsInPickOrder } from '@/features/groups/pickOrder'
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

  // The bar is on every screen, so it has to read the screen.
  const inGroup = useMatch('/groups/:groupId/*')
  const groupId = inGroup?.params.groupId

  // ...and on the form itself it would point at the page it is already on, over
  // a screen whose whole job is to be finished or cancelled.
  const onNewExpense = useMatch('/groups/:groupId/expenses/new')
  const onEditExpense = useMatch('/groups/:groupId/expenses/:expenseId/edit')
  const onScanReceipt = useMatch('/groups/:groupId/expenses/scan')
  const onEditor = Boolean(onNewExpense ?? onEditExpense ?? onScanReceipt)

  // A closed group takes no new expenses, so it is not offered one. The group
  // list is already in cache from the screens that use it; this shell sits
  // above `GroupScopeRoute` and so has no scope of its own to read.
  const groups = useGroups()
  const inClosedGroup = Boolean(
    groupId && groups.data?.some((group) => group.id === groupId && !isGroupOpen(group)),
  )

  // Outside a group the bar has to find one. Three cases, and only the middle
  // one needs a sheet:
  //
  //   no groups at all -> the groups list, whose empty state says what to do
  //   exactly one open -> straight into its form, no tap spent confirming
  //   two or more     -> the picker
  //
  // The old fallback was the groups list in every case, which threw away the
  // intention you tapped the bar with.
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickable = openGroupsInPickOrder(groups.data)
  const addExpenseTo = groupId
    ? `/groups/${groupId}/expenses/new`
    : pickable.length === 1
      ? `/groups/${pickable[0]?.id}/expenses/new`
      : '/groups'
  const needsPicker = !groupId && pickable.length > 1

  // One class for all three, so a button and a link cannot drift apart.
  const barClass =
    'bg-accent text-on-accent shadow-float font-display pointer-events-auto mx-auto flex h-13 w-full max-w-2xl items-center justify-center gap-2 rounded-full text-lg font-extrabold transition-transform active:scale-[0.98]'

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
          {needsPicker ? (
            <button type="button" onClick={() => setPickerOpen(true)} className={barClass}>
              <PlusIcon className="size-5" />
              {t('common.shell.addExpense')}
            </button>
          ) : (
            <Link to={addExpenseTo} className={barClass}>
              <PlusIcon className="size-5" />
              {t('common.shell.addExpense')}
            </Link>
          )}
        </div>
      )}

      <GroupPickerSheet open={pickerOpen} onClose={() => setPickerOpen(false)} />

      <TabBar unreadCount={unreadCount} />

      <UpdatePrompt />
      <IosInstallHint />
    </div>
  )
}
