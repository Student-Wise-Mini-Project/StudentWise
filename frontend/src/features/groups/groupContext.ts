import { createContext, use } from 'react'

import type { Group, GroupMember } from '@/api/types'

export type GroupScope = {
  group: Group
  groupId: string
  /** Every amount in this group is in this currency; expenses never carry one. */
  currency: string
  /** Everyone still in the group. Only these may join a new split. */
  activeMembers: GroupMember[]
  /** Includes people who have left, because their history and balance remain. */
  allMembers: GroupMember[]
  me: GroupMember | undefined
  isOwner: boolean
}

/**
 * The group, fetched once by `GroupLayout` and read by everything under it.
 *
 * Currency in particular is never passed down through props: `<Money>` reads it
 * from here, so no screen can accidentally render a trip's euros with a flat's
 * shekel sign.
 */
export const GroupContext = createContext<GroupScope | null>(null)

export function useGroupScope(): GroupScope {
  const scope = use(GroupContext)
  if (!scope) throw new Error('useGroupScope must be used inside a group route')
  return scope
}
