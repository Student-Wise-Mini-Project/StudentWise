import type { ComponentType, SVGProps } from 'react'

import { BellIcon, GroupsIcon, HomeIcon, PersonIcon } from '@/components/icons'
import type { MessageKey } from '@/i18n/messages'

export type NavItem = {
  to: string
  /** A catalogue key. The two nav components translate at render.*/
  label: MessageKey
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
  { to: '/', label: 'common.nav.home', icon: HomeIcon, end: true },
  { to: '/groups', label: 'common.nav.groups', icon: GroupsIcon },
  { to: '/notifications', label: 'common.nav.alerts', icon: BellIcon, badge: 'unread' },
  { to: '/settings', label: 'common.nav.you', icon: PersonIcon },
]
