import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/api/queryClient'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { apiUrl } from '@/test/apiUrl'
import { server } from '@/test/server'

import { GroupListScreen } from './GroupListScreen'

const user = (id: string, name: string) => ({
  id,
  name,
  email: `${id}@studentwise.dev`,
  phone_number: null,
  created_at: '2026-01-01T00:00:00Z',
})

const GAL = user('u-gal', 'Gal')
const MAYA = user('u-maya', 'Maya')

const member = (u: ReturnType<typeof user>) => ({
  user: u,
  role: u.id === GAL.id ? 'OWNER' : 'MEMBER',
  default_split_weight: '1',
  joined_at: '2026-01-01T00:00:00Z',
  left_at: null,
})

function group(id: string, name: string, members = [GAL], archived: string | null = null) {
  return {
    id,
    name,
    type: 'SHARED_APARTMENT',
    currency: 'ILS',
    created_by: GAL.id,
    created_at: '2026-01-01T00:00:00Z',
    archived_at: archived,
    members: members.map(member),
  }
}

function renderScreen(
  groups: ReturnType<typeof group>[],
  extra: Parameters<typeof server.use> = [],
) {
  window.localStorage.setItem('sw.token', 'tok')
  server.use(
    http.get(apiUrl('/api/auth/me'), () => HttpResponse.json(GAL)),
    http.get(apiUrl('/api/groups'), () => HttpResponse.json(groups)),
    ...extra,
  )

  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <AuthProvider>
          <GroupListScreen />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('the group list', () => {
  it('files closed groups under their own heading rather than hiding them', async () => {
    renderScreen([
      group('g1', 'Dizengoff 5'),
      group('g2', 'Eilat 2025', [GAL], '2026-09-01T00:00:00Z'),
    ])

    expect(await screen.findByText('Dizengoff 5')).toBeInTheDocument()
    expect(screen.getByText('Eilat 2025')).toBeInTheDocument()
    // Twice on purpose: the section heading, and the badge on the row where an
    // open group carries its kind.
    expect(screen.getAllByText('Closed')).toHaveLength(2)
  })

  it('offers an owner Reopen on a closed row, without walking into the group', async () => {
    // Reopening is the answer to "I closed the wrong one", and that is realised
    // while looking at the list, not after walking into the group to find out.
    let reopened = ''
    renderScreen(
      [group('g1', 'Dizengoff 5'), group('g2', 'Eilat 2025', [GAL], '2026-09-01T00:00:00Z')],
      [
        http.post(apiUrl('/api/groups/g2/reopen'), () => {
          reopened = 'g2'
          return HttpResponse.json(group('g2', 'Eilat 2025'))
        }),
      ],
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Reopen' }))
    await waitFor(() => expect(reopened).toBe('g2'))
  })

  it('offers a plain member no Reopen', async () => {
    renderScreen([group('g2', 'Eilat 2025', [MAYA], '2026-09-01T00:00:00Z')])

    expect(await screen.findByText('Eilat 2025')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reopen' })).not.toBeInTheDocument()
  })
})
