import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { api, unwrap } from '@/api/client'
import { invalidateLedger } from '@/api/invalidate'
import type { RunResult } from '@/api/types'

/**
 * Nothing runs on a scheduler, so the app has to ask.
 *
 * `POST .../recurring-bills/run` posts every bill that has come due and reminds
 * about the ones whose amount varies. The README states the app calls it on
 * load, and it is idempotent -- a unique index makes posting the same bill twice
 * for one date a 409 -- so calling it is safe but not free.
 *
 * Once per group per session, therefore: on every render would be a write
 * request behind every navigation, and on every app load would fire it for a
 * group nobody opened.
 */
const alreadyRun = new Set<string>()

export function useRunDueBillsOnce(groupId: string | undefined) {
  const queryClient = useQueryClient()

  const run = useMutation({
    mutationFn: (id: string) =>
      unwrap<RunResult>(
        api.POST('/api/groups/{group_id}/recurring-bills/run', {
          params: { path: { group_id: id } },
        }),
      ),
    onSuccess: (result, id) => {
      // Only disturb the caches if something actually happened. A run that posts
      // nothing is the common case and should be invisible.
      if (result.generated.length > 0) invalidateLedger(queryClient, id)
    },
  })

  const { mutate } = run
  useEffect(() => {
    if (!groupId || alreadyRun.has(groupId)) return
    alreadyRun.add(groupId)
    mutate(groupId)
  }, [groupId, mutate])

  return run
}

/** Test seam: lets a test start from a clean slate. */
export function resetRunTracking(): void {
  alreadyRun.clear()
}
