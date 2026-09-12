import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
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
const NOA = user('u-noa', 'Noa')

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

describe('creating a group', () => {
  it('suggests the people from your other groups', async () => {
    renderScreen([group('g1', 'Dizengoff 5', [GAL, MAYA, NOA])])

    await userEvent.click(await screen.findByRole('button', { name: 'New' }))
    const sheet = within(await screen.findByRole('dialog'))

    expect(await sheet.findByRole('button', { name: /Maya/ })).toBeInTheDocument()
    expect(sheet.getByRole('button', { name: /Noa/ })).toBeInTheDocument()
    // Never yourself: you are the owner of the group being created.
    expect(sheet.queryByRole('button', { name: /^Gal/ })).not.toBeInTheDocument()
  })

  it('adds each picked person after creating the group', async () => {
    const added: unknown[] = []
    renderScreen(
      [group('g1', 'Dizengoff 5', [GAL, MAYA])],
      [
        http.post(apiUrl('/api/groups'), () =>
          HttpResponse.json(group('g9', 'Greece'), { status: 201 }),
        ),
        http.post(apiUrl('/api/groups/g9/members'), async ({ request }) => {
          added.push(await request.json())
          return HttpResponse.json({}, { status: 201 })
        }),
      ],
    )

    await userEvent.click(await screen.findByRole('button', { name: 'New' }))
    const sheet = within(await screen.findByRole('dialog'))
    await userEvent.type(sheet.getByLabelText(/Name/), 'Greece')
    await userEvent.click(await sheet.findByRole('button', { name: /Maya/ }))
    await userEvent.click(sheet.getByRole('button', { name: 'Create' }))

    // By user_id, not by email: the id is already in hand, and an email round
    // trip is a chance to mistype somebody who is already a known account.
    await waitFor(() => expect(added).toEqual([{ user_id: 'u-maya', default_split_weight: '1' }]))
  })

  it('says so when the group was created but somebody could not be added', async () => {
    // Two requests, not one transaction. A silent half-success would leave you
    // believing Maya is in a group she is not in.
    renderScreen(
      [group('g1', 'Dizengoff 5', [GAL, MAYA])],
      [
        http.post(apiUrl('/api/groups'), () =>
          HttpResponse.json(group('g9', 'Greece'), { status: 201 }),
        ),
        http.post(apiUrl('/api/groups/g9/members'), () =>
          HttpResponse.json({ detail: 'Nope' }, { status: 500 }),
        ),
      ],
    )

    await userEvent.click(await screen.findByRole('button', { name: 'New' }))
    const sheet = within(await screen.findByRole('dialog'))
    await userEvent.type(sheet.getByLabelText(/Name/), 'Greece')
    await userEvent.click(await sheet.findByRole('button', { name: /Maya/ }))
    await userEvent.click(sheet.getByRole('button', { name: 'Create' }))

    expect(await screen.findByText(/could not be added/)).toBeInTheDocument()
  })
})
