/**
 * Every cache key in the app, in one hierarchy.
 *
 * Group-scoped resources deliberately nest *under* the group's detail key:
 *
 *   ['groups', 'detail', id]
 *   ['groups', 'detail', id, 'expenses', filters]
 *   ['groups', 'detail', id, 'balances']
 *
 * so invalidating the group invalidates its expenses, balances, settlement plan
 * and activity in one call. That matters more than it looks: a new expense
 * changes all four, and the failure mode of scattering those calls across nine
 * mutations is a balances screen that quietly disagrees with the expense list.
 * It is the same reasoning as building a page and its `total` from one filter
 * helper on the backend.
 *
 * Filters are always last and always normalised, so `{category: undefined}` and
 * `{}` are the same cache entry rather than two.
 */
export const qk = {
  auth: {
    me: () => ['auth', 'me'] as const,
  },
  users: {
    search: (email: string) => ['users', 'search', email] as const,
  },
  groups: {
    all: () => ['groups'] as const,
    list: () => ['groups', 'list'] as const,
    detail: (groupId: string) => ['groups', 'detail', groupId] as const,
    expenses: (groupId: string, filters: Record<string, unknown> = {}) =>
      ['groups', 'detail', groupId, 'expenses', normalise(filters)] as const,
    settlements: (groupId: string) => ['groups', 'detail', groupId, 'settlements'] as const,
    balances: (groupId: string) => ['groups', 'detail', groupId, 'balances'] as const,
    plan: (groupId: string) => ['groups', 'detail', groupId, 'plan'] as const,
    activity: (groupId: string) => ['groups', 'detail', groupId, 'activity'] as const,
    recurringBills: (groupId: string) => ['groups', 'detail', groupId, 'recurring-bills'] as const,
  },
  expenses: {
    detail: (expenseId: string) => ['expenses', 'detail', expenseId] as const,
    comments: (expenseId: string) => ['expenses', 'detail', expenseId, 'comments'] as const,
    receipt: (expenseId: string) => ['expenses', 'detail', expenseId, 'receipt'] as const,
  },
  settlements: {
    detail: (settlementId: string) => ['settlements', 'detail', settlementId] as const,
  },
  activity: {
    feed: () => ['activity'] as const,
  },
  notifications: {
    all: () => ['notifications'] as const,
    list: (unreadOnly: boolean) => ['notifications', 'list', { unreadOnly }] as const,
    unreadCount: () => ['notifications', 'unread-count'] as const,
  },
} as const

/** Drop undefined values and sort keys, so equivalent filters share a cache entry. */
function normalise(filters: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== '' && value !== null)
      .sort(([a], [b]) => a.localeCompare(b)),
  )
}
