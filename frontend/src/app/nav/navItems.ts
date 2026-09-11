import type { ComponentType, SVGProps } from 'react'

import { BellIcon, GroupsIcon, HomeIcon, PersonIcon } from '@/components/icons'

export type NavItem = {
  to: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  /** Only match this exact path, not its children. */
  end?: boolean
  badge?: 'unread'
}

/**
 * The app's destinations, written once.
 *
 * The bottom tab bar and the desktop sidebar both render this array. Two
 * hand-maintained nav lists is how a phone ends up with a tab the desktop does
 * not have, six weeks after anyone remembers why.
 */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true },
  { to: '/groups', label: 'Groups', icon: GroupsIcon },
  { to: '/notifications', label: 'Alerts', icon: BellIcon, badge: 'unread' },
  { to: '/settings', label: 'You', icon: PersonIcon },
]
