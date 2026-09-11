import { Link, Outlet } from 'react-router'

import { OfflineBanner } from '@/components/OfflineBanner'
import { PlusIcon } from '@/components/icons'
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
  const unread = useUnreadCount()
  const unreadCount = unread.data?.unread ?? 0

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
      <div
        className="from-ground pointer-events-none fixed inset-x-0 z-30 bg-linear-to-t from-60% to-transparent px-4 pt-6 pb-2 lg:hidden"
        style={{ insetBlockEnd: 'calc(var(--sw-tabbar-height) + var(--sw-safe-block-end))' }}
      >
        <Link
          to="/groups"
          className="bg-accent text-on-accent shadow-float font-display pointer-events-auto mx-auto flex h-13 max-w-2xl items-center justify-center gap-2 rounded-full text-lg font-extrabold transition-transform active:scale-[0.98]"
        >
          <PlusIcon className="size-5" />
          Add expense
        </Link>
      </div>

      <TabBar unreadCount={unreadCount} />

      <UpdatePrompt />
      <IosInstallHint />
    </div>
  )
}
