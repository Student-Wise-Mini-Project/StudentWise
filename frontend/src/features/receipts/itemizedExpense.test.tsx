import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/api/queryClient'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { resetRunTracking } from '@/features/recurring/api'
import { AppRoutes } from '@/routes'
import { apiUrl } from '@/test/apiUrl'
import { server } from '@/test/server'

/**
 * An expense that was split line by line from a receipt, after it is saved:
 * what the detail screen shows, and what editing it does to the lines.
 */

const user = (id: string, name: string) => ({
  id,
  name,
  email: `${name.toLowerCase()}@studentwise.dev`,
  phone_number: null,
  created_at: '2026-01-01T00:00:00Z',
})

const GAL = user('u-gal', 'Gal')
const MAYA = user('u-maya', 'Maya')
const NOA = user('u-noa', 'Noa')

const GROUP = {
  id: 'g1',
  name: 'Dizengoff 5',
  type: 'SHARED_APARTMENT',
  currency: 'ILS',
  created_by: GAL.id,
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  members: [GAL, MAYA, NOA].map((u) => ({
    user: u,
    role: u.id === GAL.id ? 'OWNER' : 'MEMBER',
    default_split_weight: '1',
    joined_at: '2026-01-01T00:00:00Z',
    left_at: null,
  })),
}

const EXPENSE = {
  id: 'e1',
  group_id: 'g1',
  payer: GAL,
  title: 'Shufersal',
  total_amount: '60.00',
  category: 'GROCERIES',
  expense_date: '2026-09-20',
  split_type: 'EXACT',
  source: 'OCR',
  notes: null,
  ai_metadata: null,
  split_rule: null,
  created_by: GAL.id,
  created_at: '2026-09-27T10:00:00Z',
  updated_at: '2026-09-27T10:00:00Z',
  splits: [
    { user: GAL, owed_amount: '30.00', share_value: '30.00' },
    { user: MAYA, owed_amount: '15.00', share_value: '15.00' },
    { user: NOA, owed_amount: '15.00', share_value: '15.00' },
  ],
  items: [
    { id: 'i1', name: 'Milk', amount: '30.00', users: [GAL, MAYA, NOA] },
    { id: 'i2', name: 'Wine', amount: '20.00', users: [GAL] },
    { id: 'i3', name: 'Hummus', amount: '10.00', users: [MAYA, NOA] },
  ],
  receipt_url: null,
}

function renderAt(path: string) {
  resetRunTracking()
  window.localStorage.setItem('sw.token', 'tok')
  const patches: Record<string, unknown>[] = []
  server.use(
    http.get(apiUrl('/api/auth/me'), () => HttpResponse.json(GAL)),
    http.get(apiUrl('/api/groups'), () => HttpResponse.json([GROUP])),
    http.get(apiUrl('/api/groups/g1'), () => HttpResponse.json(GROUP)),
    http.get(apiUrl('/api/groups/g1/balances'), () =>
      HttpResponse.json({ group_id: 'g1', currency: 'ILS', balances: [] }),
    ),
    http.get(apiUrl('/api/notifications/unread-count'), () => HttpResponse.json({ unread: 0 })),
    http.post(apiUrl('/api/groups/g1/recurring-bills/run'), () =>
      HttpResponse.json({ generated: [], awaiting_amount: [], reminded: [] }),
    ),
    http.get(apiUrl('/api/expenses/e1'), () => HttpResponse.json(EXPENSE)),
    http.get(apiUrl('/api/expenses/e1/comments'), () =>
      HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0, has_more: false }),
    ),
    http.patch(apiUrl('/api/expenses/e1'), async ({ request }) => {
      patches.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json(EXPENSE)
    }),
  )
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return patches
}

describe('an expense split from a receipt', () => {
  it('shows its lines, with a line everyone shared read as everyone', async () => {
    renderAt('/groups/g1/expenses/e1')

    const lines = (await screen.findByText('Receipt lines')).closest('section') as HTMLElement
    expect(within(lines).getByText('Milk')).toBeInTheDocument()
    expect(within(lines).getByText('Wine')).toBeInTheDocument()
    expect(within(lines).getByText('Hummus')).toBeInTheDocument()
    expect(within(lines).getAllByText('Everyone')).toHaveLength(1)
  })

  it('warns, when editing, that changing the split replaces the lines', async () => {
    renderAt('/groups/g1/expenses/e1/edit')
    expect(await screen.findByText(/split line by line from a receipt/)).toBeInTheDocument()
  })

  it('keeps the lines when only the title changes', async () => {
    const patches = renderAt('/groups/g1/expenses/e1/edit')

    const title = await screen.findByLabelText('What was it?')
    await userEvent.clear(title)
    await userEvent.type(title, 'Weekly shop')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]).toMatchObject({ title: 'Weekly shop' })
    // No split in the request, so the server has no reason to touch the lines.
    for (const key of ['total_amount', 'payer_id', 'split_type', 'participants']) {
      expect(patches[0]).not.toHaveProperty(key)
    }
  })

  it('sends the split when the amount really changed', async () => {
    const patches = renderAt('/groups/g1/expenses/e1/edit')

    const amount = await screen.findByLabelText('Amount')
    await userEvent.clear(amount)
    await userEvent.type(amount, '90')
    await userEvent.click(screen.getByRole('radio', { name: /Equally/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]).toMatchObject({ total_amount: '90.00', split_type: 'EQUAL' })
    expect(patches[0]).toHaveProperty('participants')
  })
})
