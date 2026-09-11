import type { QueryClient } from '@tanstack/react-query'

import { qk } from './queryKeys'

/**
 * Everything that changes when money moves, invalidated together.
 *
 * A new expense changes the expense list, the balances, the settlement plan, the
 * group's activity, the global feed and somebody's unread count. Calling those
 * six invalidations by hand in each of nine mutations is how a balances screen
 * ends up quietly disagreeing with the expense list it sits next to -- one
 * mutation forgets one line and nothing fails.
 *
 * The group-nested key shape is what makes this cheap: invalidating
 * `['groups','detail',id]` covers expenses, balances, plan, settlements and
 * activity in a single call.
 */
export function invalidateLedger(queryClient: QueryClient, groupId: string): void {
  void queryClient.invalidateQueries({ queryKey: qk.groups.detail(groupId) })
  void queryClient.invalidateQueries({ queryKey: qk.activity.feed() })
  void queryClient.invalidateQueries({ queryKey: qk.notifications.all() })
}

/** Membership changes alter the group list too (names, who is in what). */
export function invalidateMembership(queryClient: QueryClient, groupId: string): void {
  void queryClient.invalidateQueries({ queryKey: qk.groups.detail(groupId) })
  void queryClient.invalidateQueries({ queryKey: qk.groups.list() })
}
