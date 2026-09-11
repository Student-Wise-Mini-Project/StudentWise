import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/api/queryClient'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { resetRunTracking } from '@/features/recurring/api'
import { apiUrl } from '@/test/apiUrl'
import { server } from '@/test/server'

import { AppRoutes } from './routes'

const GAL = {
  id: 'u1',
  name: 'Gal',
  email: 'gal@studentwise.dev',
  phone_number: null,
  created_at: '2026-09-01T10:00:00Z',
}

const GROUP = {
  id: 'g1',
  name: 'Dizengoff 5',
  type: 'SHARED_APARTMENT',
  currency: 'ILS',
  created_by: 'u1',
  created_at: '2026-09-01T10:00:00Z',
  members: [
    {
      user: GAL,
      role: 'OWNER',
      default_split_weight: '1',
      joined_at: '2026-09-01T10:00:00Z',
      left_at: null,
    },
  ],
}

const EXPENSE = {
  id: 'e1',
  group_id: 'g1',
  payer: GAL,
  title: 'Supermarket',
  total_amount: '212.30',
  category: 'GROCERIES',
  expense_date: '2026-09-09',
  split_type: 'EQUAL',
  source: 'MANUAL',
  notes: null,
  ai_metadata: null,
  split_rule: null,
  created_by: 'u1',
  created_at: '2026-09-09T10:00:00Z',
  updated_at: '2026-09-09T10:00:00Z',
  splits: [{ user: GAL, owed_amount: '212.30', share_value: null }],
  receipt_url: null,
}

function renderAt(path: string) {
  resetRunTracking()
  window.localStorage.setItem('sw.token', 'tok')
  server.use(
    http.get(apiUrl('/api/auth/me'), () => HttpResponse.json(GAL)),
    http.get(apiUrl('/api/groups'), () => HttpResponse.json([GROUP])),
    http.get(apiUrl('/api/groups/g1'), () => HttpResponse.json(GROUP)),
    http.get(apiUrl('/api/expenses/e1'), () => HttpResponse.json(EXPENSE)),
    http.get(apiUrl('/api/groups/g1/expenses'), () =>
      HttpResponse.json({ items: [EXPENSE], total: 1, limit: 20, offset: 0, has_more: false }),
    ),
    http.get(apiUrl('/api/notifications'), () =>
      HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0, has_more: false }),
    ),
    http.get(apiUrl('/api/notifications/unread-count'), () => HttpResponse.json({ unread: 0 })),
    http.get(apiUrl('/api/groups/g1/balances'), () =>
      HttpResponse.json({
        group_id: 'g1',
        currency: 'ILS',
        balances: [
          {
            user: GAL,
            paid: '0.00',
            owed: '0.00',
            settlements_sent: '0.00',
            settlements_received: '0.00',
            net: '0.00',
          },
        ],
      }),
    ),
    http.get(apiUrl('/api/groups/g1/settlement-plan'), () =>
      HttpResponse.json({ group_id: 'g1', currency: 'ILS', transfers: [] }),
    ),
    http.get(apiUrl('/api/expenses/e1/comments'), () =>
      HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0, has_more: false }),
    ),
    // Opening a group posts any bills that are due -- see features/recurring.
    http.post(apiUrl('/api/groups/g1/recurring-bills/run'), () =>
      HttpResponse.json({ generated: [], awaiting_amount: [], reminded: [] }),
    ),
  )
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/**
 * Every route a link in the app points at actually resolves.
 *
 * This exists because `/expenses/:id/edit` did not: the edit link was built from
 * the flat expense path, which matches no route and fell straight through to Not
 * Found. Nothing failed -- the page just said "Nothing here", which looks like a
 * deleted expense rather than a broken link.
 */
describe('routes resolve', () => {
  const paths = [
    '/groups',
    '/groups/g1',
    '/groups/g1/balances',
    '/groups/g1/members',
    '/groups/g1/expenses/new',
    '/groups/g1/expenses/e1',
    '/groups/g1/expenses/e1/edit',
    '/notifications',
    '/settings',
  ]

  for (const path of paths) {
    it(`${path} is not a dead end`, async () => {
      renderAt(path)
      // `findAllByRole`, not `findByRole`: most screens have several headings
      // and the singular form throws on more than one match.
      await screen.findAllByRole('heading', undefined, { timeout: 3000 })
      expect(screen.queryByText('That page does not exist.')).not.toBeInTheDocument()
    })
  }

  it('a bare /expenses/:id link redirects into its group', async () => {
    // The activity feed and notifications link to an expense without knowing
    // which group it belongs to, so the flat path has to resolve itself.
    renderAt('/expenses/e1')
    expect(await screen.findByText('Who owes what (1)')).toBeInTheDocument()
  })

  it('an unknown path still says so', async () => {
    renderAt('/definitely-not-a-page')
    expect(await screen.findByText('That page does not exist.')).toBeInTheDocument()
  })
})
