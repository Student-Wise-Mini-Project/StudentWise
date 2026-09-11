import { Link, Outlet } from 'react-router'

import { OfflineBanner } from '@/components/OfflineBanner'
import { PlusIcon } from '@/components/icons'
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
export function AppShell({ unreadCount = 0 }: { unreadCount?: number }) {
  return (
    <div className="min-h-dvh lg:ps-60">
      <OfflineBanner />
      <SideNav unreadCount={unreadCount} />

      <main
        className="pb-20 lg:pb-8"
        // Clear the tab bar *and* the home indicator, so the last row of a list
        // is never stuck behind either.
        style={{
          paddingBlockEnd: 'calc(var(--sw-tabbar-height) + var(--sw-safe-block-end) + 1rem)',
        }}
      >
        <Outlet />
      </main>

      <Link
        to="/groups"
        aria-label="Add an expense"
        className="bg-accent text-on-accent shadow-float fixed end-4 z-30 flex size-14 items-center justify-center rounded-full transition-transform active:scale-95 lg:hidden"
        style={{ insetBlockEnd: 'calc(var(--sw-tabbar-height) + var(--sw-safe-block-end) + 1rem)' }}
      >
        <PlusIcon className="size-7" />
      </Link>

      <TabBar unreadCount={unreadCount} />

      <UpdatePrompt />
      <IosInstallHint />
    </div>
  )
}
