import { QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { createQueryClient } from '@/api/queryClient'
import { apiUrl } from '@/test/apiUrl'
import { server } from '@/test/server'

import { resetRunTracking, useRunDueBillsOnce } from './api'

const EMPTY_RUN = { generated: [], awaiting_amount: [], reminded: [] }

function Probe({ groupId }: { groupId: string | undefined }) {
  useRunDueBillsOnce(groupId)
  return <div>probe</div>
}

function renderProbe(groupId: string | undefined, client = createQueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <Probe groupId={groupId} />
    </QueryClientProvider>,
  )
}

describe('running due bills when a group opens', () => {
  beforeEach(() => {
    resetRunTracking()
  })

  it('posts the run once', async () => {
    // Nothing runs on a scheduler, so opening a group is what posts the rent.
    let calls = 0
    server.use(
      http.post(apiUrl('/api/groups/g1/recurring-bills/run'), () => {
        calls += 1
        return HttpResponse.json(EMPTY_RUN)
      }),
    )

    renderProbe('g1')
    await waitFor(() => expect(calls).toBe(1))
  })

  it('does not post it again for the same group in one session', async () => {
    // It is a write request behind a navigation. Firing it on every render would
    // mean one per screen change.
    let calls = 0
    server.use(
      http.post(apiUrl('/api/groups/g1/recurring-bills/run'), () => {
        calls += 1
        return HttpResponse.json(EMPTY_RUN)
      }),
    )

    const first = renderProbe('g1')
    await waitFor(() => expect(calls).toBe(1))
    first.unmount()

    renderProbe('g1')
    // Give a second call a chance to happen before asserting it did not.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(calls).toBe(1)
  })

  it('runs separately for a different group', async () => {
    const seen: string[] = []
    server.use(
      http.post(apiUrl('/api/groups/g1/recurring-bills/run'), () => {
        seen.push('g1')
        return HttpResponse.json(EMPTY_RUN)
      }),
      http.post(apiUrl('/api/groups/g2/recurring-bills/run'), () => {
        seen.push('g2')
        return HttpResponse.json(EMPTY_RUN)
      }),
    )

    renderProbe('g1')
    await waitFor(() => expect(seen).toContain('g1'))
    renderProbe('g2')
    await waitFor(() => expect(seen).toContain('g2'))
  })

  it('does nothing without a group id', async () => {
    let calls = 0
    server.use(
      http.post(apiUrl('/api/groups/g1/recurring-bills/run'), () => {
        calls += 1
        return HttpResponse.json(EMPTY_RUN)
      }),
    )
    renderProbe(undefined)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(calls).toBe(0)
  })

  it('a failed run does not break the screen', async () => {
    // The group has to open whether or not the bills could be posted.
    server.use(
      http.post(apiUrl('/api/groups/g1/recurring-bills/run'), () =>
        HttpResponse.json({ detail: 'Nope' }, { status: 500 }),
      ),
    )
    const { getByText } = renderProbe('g1')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(getByText('probe')).toBeInTheDocument()
  })
})
