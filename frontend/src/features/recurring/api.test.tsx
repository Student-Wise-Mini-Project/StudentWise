import { QueryClientProvider } from '@tanstack/react-query'
import { render, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { createQueryClient } from '@/api/queryClient'
import { qk } from '@/api/queryKeys'
import { apiUrl } from '@/test/apiUrl'
import { server } from '@/test/server'

import type { ReactNode } from 'react'

import {
  resetRunTracking,
  useCreateBill,
  useGenerateBill,
  useRecurringBills,
  useRunDueBillsOnce,
} from './api'

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

const BILL = {
  id: 'b1',
  group_id: 'g1',
  title: 'Rent',
  amount: '3600.00',
  category: 'RENT',
  payer: {
    id: 'u-gal',
    name: 'Gal',
    email: 'gal@studentwise.dev',
    phone_number: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  split_type: 'EQUAL',
  frequency: 'MONTHLY',
  next_due_on: '2026-10-01',
  anchor_day: 1,
  active: true,
  reminder_days_before: 3,
  last_generated_on: null,
  participants: [],
  created_by: 'u-gal',
  created_at: '2026-01-01T00:00:00Z',
  posts_itself: true,
}

function hookWrapper(client = createQueryClient()) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

describe('the recurring-bill hooks', () => {
  it('lists a group bills, soonest due first as the API sends them', async () => {
    server.use(http.get(apiUrl('/api/groups/g1/recurring-bills'), () => HttpResponse.json([BILL])))

    const { result } = renderHook(() => useRecurringBills('g1'), { wrapper: hookWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0]?.title).toBe('Rent')
  })

  it('creating a schedule leaves the ledger alone', async () => {
    // A schedule is not money. Nothing has been spent, so nothing in the
    // balances, the expense list or the feed has gone stale.
    const client = createQueryClient()
    client.setQueryData(qk.groups.balances('g1'), { group_id: 'g1', currency: 'ILS', balances: [] })
    server.use(
      http.post(apiUrl('/api/groups/g1/recurring-bills'), () =>
        HttpResponse.json(BILL, { status: 201 }),
      ),
    )

    const { result } = renderHook(() => useCreateBill('g1'), { wrapper: hookWrapper(client) })
    result.current.mutate({
      title: 'Rent',
      frequency: 'MONTHLY',
      first_due_on: '2026-10-01',
      payer_id: 'u-gal',
      amount: '3600.00',
      split_type: 'EQUAL',
      reminder_days_before: 3,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(client.getQueryState(qk.groups.balances('g1'))?.isInvalidated).toBe(false)
  })

  it('posting a bill invalidates the ledger, because that is a real expense', async () => {
    const client = createQueryClient()
    client.setQueryData(qk.groups.balances('g1'), { group_id: 'g1', currency: 'ILS', balances: [] })
    server.use(
      http.post(apiUrl('/api/groups/g1/recurring-bills/b1/generate'), () =>
        HttpResponse.json({ id: 'e1' }, { status: 201 }),
      ),
    )

    const { result } = renderHook(() => useGenerateBill('g1'), { wrapper: hookWrapper(client) })
    result.current.mutate({ billId: 'b1', amount: '412.30' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    await waitFor(() =>
      expect(client.getQueryState(qk.groups.balances('g1'))?.isInvalidated).toBe(true),
    )
  })
})
