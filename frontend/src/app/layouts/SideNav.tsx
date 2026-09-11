import { NavLink } from 'react-router'

import { NAV_ITEMS } from '@/app/nav/navItems'
import { CountBadge } from '@/components/Badge'
import { cn } from '@/lib/cn'

/** The same destinations as the tab bar, laid out for a pointer and a big screen. */
export function SideNav({ unreadCount = 0 }: { unreadCount?: number }) {
  return (
    <nav
      aria-label="Main"
      className="border-line bg-surface fixed inset-y-0 start-0 z-30 hidden w-60 border-e lg:block"
    >
      <div className="border-line flex h-13 items-center border-b px-5">
        <span className="font-display text-lg font-extrabold tracking-[-0.01em]">StudentWise</span>
      </div>

      <ul className="flex flex-col gap-0.5 px-3 py-2">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'font-display flex items-center gap-3 rounded-md px-3 py-2.5 text-base transition-colors',
                  isActive
                    ? 'bg-accent-soft text-accent font-extrabold'
                    : 'text-muted hover:bg-sunken hover:text-ink font-bold',
                )
              }
            >
              <item.icon className="size-5" />
              <span className="flex-1">{item.label}</span>
              {item.badge === 'unread' && <CountBadge count={unreadCount} />}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
