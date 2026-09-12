import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { createQueryClient } from '@/api/queryClient'
import { AppShell } from '@/app/layouts/AppShell'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { apiUrl } from '@/test/apiUrl'
import { server } from '@/test/server'

const GAL = {
  id: 'u-gal',
  name: 'Gal',
  email: 'gal@studentwise.dev',
  phone_number: null,
  created_at: '2026-01-01T00:00:00Z',
}

function group(id: string, name: string, archived: string | null = null) {
  return {
    id,
    name,
    type: 'SHARED_APARTMENT',
    currency: 'ILS',
    created_by: GAL.id,
    created_at: '2026-01-01T00:00:00Z',
    archived_at: archived,
    members: [
      {
        user: GAL,
        role: 'OWNER',
        default_split_weight: '1',
        joined_at: '2026-01-01T00:00:00Z',
        left_at: null,
      },
    ],
  }
}

function balances(groupId: string, net: string) {
  return {
    group_id: groupId,
    currency: 'ILS',
    balances: [
      {
        user: GAL,
        paid: '0.00',
        owed: '0.00',
        settlements_sent: '0.00',
        settlements_received: '0.00',
        net,
      },
    ],
  }
}

/** Renders the location so a navigation can be asserted on. */
function Probe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderShell(groups: ReturnType<typeof group>[]) {
  window.localStorage.setItem('sw.token', 'tok')
  server.use(
    http.get(apiUrl('/api/auth/me'), () => HttpResponse.json(GAL)),
    http.get(apiUrl('/api/groups'), () => HttpResponse.json(groups)),
    http.get(apiUrl('/api/notifications/unread-count'), () => HttpResponse.json({ unread: 0 })),
    http.get(apiUrl('/api/activity'), () =>
      HttpResponse.json({ items: [], total: 0, limit: 20, offset: 0, has_more: false }),
    ),
    ...groups.map((g) =>
      http.get(apiUrl(`/api/groups/${g.id}/balances`), () =>
        HttpResponse.json(balances(g.id, '0.00')),
      ),
    ),
  )

  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Probe />} />
              <Route path="*" element={<Probe />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('the + bar outside a group', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('opens a picker when there is more than one group to choose from', async () => {
    renderShell([group('g1', 'Dizengoff 5'), group('g2', 'Greece 2026')])

    await userEvent.click(await screen.findByRole('button', { name: /Add expense/i }))

    const sheet = within(await screen.findByRole('dialog'))
    expect(sheet.getByText('Dizengoff 5')).toBeInTheDocument()
    expect(sheet.getByText('Greece 2026')).toBeInTheDocument()
  })

  it('carries the intent into the chosen group rather than dropping it', async () => {
    // The whole point: tapping + used to land on the groups list, where the
    // half-formed intention to add an expense had to be formed again.
    renderShell([group('g1', 'Dizengoff 5'), group('g2', 'Greece 2026')])

    await userEvent.click(await screen.findByRole('button', { name: /Add expense/i }))
    const sheet = within(await screen.findByRole('dialog'))
    await userEvent.click(sheet.getByText('Greece 2026'))

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/groups/g2/expenses/new'),
    )
  })

  it('skips the picker entirely when there is only one open group', async () => {
    // Most people are in one main group and should not pay a tap to confirm it.
    renderShell([group('g1', 'Dizengoff 5')])

    const bar = await screen.findByRole('link', { name: /Add expense/i })
    await userEvent.click(bar)

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/groups/g1/expenses/new'),
    )
  })

  it('leaves closed groups out of the picker', async () => {
    renderShell([
      group('g1', 'Dizengoff 5'),
      group('g2', 'Greece 2026'),
      group('g3', 'Eilat 2025', '2026-09-01T00:00:00Z'),
    ])

    await userEvent.click(await screen.findByRole('button', { name: /Add expense/i }))

    const sheet = within(await screen.findByRole('dialog'))
    expect(sheet.getByText('Dizengoff 5')).toBeInTheDocument()
    expect(sheet.queryByText('Eilat 2025')).not.toBeInTheDocument()
  })

  it('leads with the group opened most recently', async () => {
    window.localStorage.setItem('sw.lastGroup', 'g2')
    renderShell([group('g1', 'Dizengoff 5'), group('g2', 'Greece 2026')])

    await userEvent.click(await screen.findByRole('button', { name: /Add expense/i }))

    // The sheet's own close control is a button too; the rows are the ones
    // carrying a group's name.
    const rows = within(await screen.findByRole('dialog'))
      .getAllByRole('button')
      .filter((button) => button.textContent?.trim())
    expect(rows[0]).toHaveTextContent('Greece 2026')
    expect(rows[1]).toHaveTextContent('Dizengoff 5')
  })

  it('still falls back to the groups list when there are no groups at all', async () => {
    // The empty state there already says what to do; a picker with nothing in
    // it would not.
    renderShell([])

    const bar = await screen.findByRole('link', { name: /Add expense/i })
    expect(bar).toHaveAttribute('href', '/groups')
  })
})
