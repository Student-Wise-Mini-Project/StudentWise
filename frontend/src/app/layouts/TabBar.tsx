import { NavLink } from 'react-router'

import { NAV_ITEMS } from '@/app/nav/navItems'
import { CountBadge } from '@/components/Badge'
import { cn } from '@/lib/cn'

/**
 * The phone's primary navigation.
 *
 * Sits in the lower third where a thumb reaches, and pads itself past the iOS
 * home indicator with `--sw-safe-block-end`. Without that padding the labels sit
 * under the indicator and the whole app looks broken on exactly the device it
 * was designed for.
 */
export function TabBar({ unreadCount = 0 }: { unreadCount?: number }) {
  return (
    <nav
      aria-label="Main"
      className="bg-surface border-line fixed inset-x-0 bottom-0 z-30 border-t lg:hidden"
      style={{ paddingBlockEnd: 'var(--sw-safe-block-end)' }}
    >
      <ul className="flex items-stretch" style={{ blockSize: 'var(--sw-tabbar-height)' }}>
        {NAV_ITEMS.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  // Marked by weight and colour, never by position: a moving
                  // indicator or a highlighted first slot reads backwards the
                  // moment the bar mirrors for Hebrew.
                  'text-2xs font-display relative flex h-full flex-col items-center justify-center gap-1 transition-colors',
                  isActive ? 'text-accent font-extrabold' : 'text-muted font-bold',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative">
                    <item.icon className={cn('size-6', isActive && 'stroke-[2.1]')} />
                    {item.badge === 'unread' && unreadCount > 0 && (
                      <span className="absolute start-3 -top-1.5">
                        <CountBadge count={unreadCount} />
                      </span>
                    )}
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
