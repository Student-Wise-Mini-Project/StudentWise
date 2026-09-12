import { useMemo } from 'react'

import type { Group, User } from '@/api/types'
import { useAuth } from '@/features/auth/authContext'

import { useGroups } from './api'

export type Suggestion = {
  user: User
  /** How many of your groups this person is also in. The ranking. */
  sharedGroups: number
}

/**
 * People you already share a group with.
 *
 * A derivation, not a request. `useGroups()` already caches every group you are
 * in **with its full member list**, so the server has nothing to tell us here
 * that we are not already holding. A `GET /users/suggestions` could rank better
 * one day -- shared expense recency rather than shared group count -- and that
 * is the day to build it, not before.
 *
 * Split from the hook so the ranking can be tested without a query client.
 */
export function rankSuggestions(
  groups: Group[],
  meId: string | undefined,
  excludeIds: string[],
): Suggestion[] {
  const excluded = new Set([...excludeIds, ...(meId ? [meId] : [])])
  const counts = new Map<string, Suggestion>()

  for (const group of groups) {
    for (const member of group.members) {
      // Leaving a group is not a suggestion to rejoin it.
      if (member.left_at !== null) continue
      if (excluded.has(member.user.id)) continue

      const seen = counts.get(member.user.id)
      if (seen) seen.sharedGroups += 1
      else counts.set(member.user.id, { user: member.user, sharedGroups: 1 })
    }
  }

  // Name breaks the tie so the chips do not wander between openings.
  return [...counts.values()].sort(
    (a, b) => b.sharedGroups - a.sharedGroups || a.user.name.localeCompare(b.user.name),
  )
}

export function useMemberSuggestions(excludeIds: string[]): Suggestion[] {
  const groups = useGroups()
  const { user } = useAuth()

  // `excludeIds` is rebuilt by the caller on every render, so the join is what
  // actually keeps this memo stable.
  const excludeKey = excludeIds.join(',')

  return useMemo(
    () =>
      rankSuggestions(groups.data ?? [], user?.id, excludeKey === '' ? [] : excludeKey.split(',')),
    [groups.data, user?.id, excludeKey],
  )
}
