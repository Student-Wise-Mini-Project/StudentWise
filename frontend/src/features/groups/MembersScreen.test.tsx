import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/api/queryClient'
import type { Group } from '@/api/types'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { GroupContext } from '@/features/groups/groupContext'
import { apiUrl } from '@/test/apiUrl'
import { server } from '@/test/server'

import { MembersScreen } from './MembersScreen'

const user = (id: string, name: string) => ({
  id,
  name,
  email: `${name.toLowerCase()}@studentwise.dev`,
  phone_number: null,
  created_at: '2026-01-01T00:00:00Z',
})

const GAL = user('u-gal', 'Gal')
const MAYA = user('u-maya', 'Maya')

const BALANCES = {
  group_id: 'g1',
  currency: 'ILS',
  balances: [
    {
      user: GAL,
      paid: '240.00',
      owed: '120.00',
      settlements_sent: '0.00',
      settlements_received: '0.00',
      net: '120.00',
    },
    {
      user: MAYA,
      paid: '0.00',
      owed: '120.00',
      settlements_sent: '0.00',
      settlements_received: '0.00',
      net: '-120.00',
    },
  ],
}

const PLAN = {
  group_id: 'g1',
  currency: 'ILS',
  transfers: [{ from_user: MAYA, to_user: GAL, amount: '120.00' }],
}

const SQUARE_PLAN = { group_id: 'g1', currency: 'ILS', transfers: [] }

function makeGroup(archived: string | null = null) {
  return {
    id: 'g1',
    name: 'Greece 2026',
    type: 'TRIP',
    currency: 'ILS',
    created_by: GAL.id,
    created_at: '2026-01-01T00:00:00Z',
    archived_at: archived,
    members: [GAL, MAYA].map((u) => ({
      user: u,
      role: u.id === GAL.id ? 'OWNER' : 'MEMBER',
      default_split_weight: '1',
      joined_at: '2026-01-01T00:00:00Z',
      left_at: null,
    })),
  } as unknown as Group
}

function renderScreen({ as = GAL, archived = null as string | null, plan = PLAN } = {}) {
  window.localStorage.setItem('sw.token', 'tok')
  server.use(
    http.get(apiUrl('/api/auth/me'), () => HttpResponse.json(as)),
    http.get(apiUrl('/api/groups/g1/balances'), () => HttpResponse.json(BALANCES)),
    http.get(apiUrl('/api/groups/g1/settlement-plan'), () => HttpResponse.json(plan)),
  )

  const group = makeGroup(archived)
  const scope = {
    group,
    groupId: 'g1',
    currency: 'ILS',
    activeMembers: group.members,
    allMembers: group.members,
    me: group.members.find((m) => m.user.id === as.id),
    isOwner: as.id === GAL.id,
    isOpen: archived === null,
  }

  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <AuthProvider>
          <GroupContext value={scope}>
            <MembersScreen />
          </GroupContext>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('the danger zone', () => {
  it('offers an owner both closing and deleting', async () => {
    renderScreen()
    expect(await screen.findByRole('button', { name: 'Close group' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete group' })).toBeInTheDocument()
  })

  it('offers a plain member neither', async () => {
    // Closing somebody else's trip, or deleting it, is not a member's call.
    renderScreen({ as: MAYA })
    await screen.findByText('In the group')
    expect(screen.queryByRole('button', { name: 'Close group' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete group' })).not.toBeInTheDocument()
  })

  it('names what is still outstanding before closing', async () => {
    // The whole reason closing is allowed while money is owed: the person
    // doing it is told what they are walking away from, by name and amount.
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: 'Close group' }))

    // Scoped to the sheet: the members list behind it carries its own ±120.00,
    // and the point of this test is what the *confirmation* says.
    const sheet = within(await screen.findByRole('dialog'))
    expect(sheet.getByText(/Maya owes Gal/)).toBeInTheDocument()
    expect(sheet.getByText(/120\.00/)).toBeInTheDocument()
    expect(sheet.getByRole('button', { name: 'Close anyway' })).toBeInTheDocument()
  })

  it('says so plainly when nobody owes anything', async () => {
    renderScreen({ plan: SQUARE_PLAN })
    await userEvent.click(await screen.findByRole('button', { name: 'Close group' }))
    expect(await screen.findByText('Everyone is square.')).toBeInTheDocument()
  })

  it('offers to reopen a closed group instead of closing it', async () => {
    renderScreen({ archived: '2026-09-12T10:00:00Z' })
    expect(await screen.findByRole('button', { name: 'Reopen' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close group' })).not.toBeInTheDocument()
  })

  it('keeps delete disabled until the group name is typed exactly', async () => {
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: 'Delete group' }))

    const submit = await screen.findByRole('button', { name: 'Delete permanently' })
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/Type the group's name/), 'Greece')
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/Type the group's name/), ' 2026')
    expect(submit).toBeEnabled()
  })
})
