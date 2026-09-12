import type { Group } from '@/api/types'
import { readLastGroupId } from '@/lib/prefs'

import { isGroupOpen } from './lifecycle'

/**
 * The groups the `+` bar may offer, most likely first.
 *
 * Closed groups are left out: they take no new expenses, so offering one is
 * offering a 409. The group opened most recently leads, because the next
 * expense is usually for the same flat as the last one; everything else is
 * alphabetical, which at least does not reshuffle between openings.
 *
 * Its own module rather than a second export from the sheet, so the sheet file
 * exports only a component and fast refresh keeps working.
 */
export function openGroupsInPickOrder(groups: Group[] | undefined): Group[] {
  const last = readLastGroupId()
  return (groups ?? []).filter(isGroupOpen).sort((a, b) => {
    if (a.id === last) return -1
    if (b.id === last) return 1
    return a.name.localeCompare(b.name)
  })
}
