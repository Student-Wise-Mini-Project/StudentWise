import type { Group } from '@/api/types'

/**
 * Is this group still taking new spending?
 *
 * `archived_at` is nullable, and the generated types also make it *optional*,
 * so it can arrive as `undefined` from an older payload or a hand-built
 * fixture. A missing field means "nobody ever closed this", so the safe
 * reading is open: the failure mode of the other reading is a live group that
 * silently refuses to be spent in.
 *
 * One predicate, because the group list, the `+` bar and the group scope all
 * have to agree about this or a group is closed in one place and open in
 * another.
 */
export function isGroupOpen(group: Pick<Group, 'archived_at'>): boolean {
  return !group.archived_at
}
