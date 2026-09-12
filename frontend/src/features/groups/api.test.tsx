import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/api/queryClient'
import { qk } from '@/api/queryKeys'
import { apiUrl } from '@/test/apiUrl'
import { server } from '@/test/server'

import { useCloseGroup, useReopenGroup } from './api'

const CLOSED = {
  id: 'g1',
  name: 'Trip to Greece',
  type: 'TRIP',
  currency: 'ILS',
  created_by: 'u-gal',
  created_at: '2026-01-01T00:00:00Z',
  archived_at: '2026-09-12T10:00:00Z',
  members: [],
}

const OPEN = { ...CLOSED, archived_at: null }

function wrapper(client = createQueryClient()) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

describe('closing and reopening a group', () => {
  it('posts to /close and reports the archived group', async () => {
    server.use(http.post(apiUrl('/api/groups/g1/close'), () => HttpResponse.json(CLOSED)))

    const { result } = renderHook(() => useCloseGroup(), { wrapper: wrapper() })
    result.current.mutate('g1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.archived_at).toBe('2026-09-12T10:00:00Z')
  })

  it('invalidates the whole groups tree, not just the one group', async () => {
    // Closing moves a group between two sections of the list and changes
    // whether the + bar offers it at all, so the list is as stale as the
    // group itself.
    const client = createQueryClient()
    client.setQueryData(qk.groups.list(), [OPEN])
    server.use(http.post(apiUrl('/api/groups/g1/close'), () => HttpResponse.json(CLOSED)))

    const { result } = renderHook(() => useCloseGroup(), { wrapper: wrapper(client) })
    result.current.mutate('g1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    await waitFor(() => expect(client.getQueryState(qk.groups.list())?.isInvalidated).toBe(true))
  })

  it('posts to /reopen and clears archived_at', async () => {
    server.use(http.post(apiUrl('/api/groups/g1/reopen'), () => HttpResponse.json(OPEN)))

    const { result } = renderHook(() => useReopenGroup(), { wrapper: wrapper() })
    result.current.mutate('g1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.archived_at).toBeNull()
  })
})
