import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
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

import { BalancesScreen } from './BalancesScreen'

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

// The real figures from `python seed.py`, so the test fails if the screen starts
// disagreeing with the API it was built against.
const BALANCES = {
  group_id: 'g1',
  currency: 'ILS',
  balances: [
    {
      user: MAYA,
      paid: '3757.40',
      owed: '1800.62',
      settlements_sent: '0.00',
      settlements_received: '100.00',
      net: '2056.78',
    },
    {
      user: NOA,
      paid: '1144.00',
      owed: '1726.02',
      settlements_sent: '0.00',
      settlements_received: '0.00',
      net: '-582.02',
    },
    {
      user: GAL,
      paid: '401.80',
      owed: '1776.56',
      settlements_sent: '100.00',
      settlements_received: '0.00',
      net: '-1474.76',
    },
  ],
}

const PLAN = {
  group_id: 'g1',
  currency: 'ILS',
  transfers: [
    { from_user: GAL, to_user: MAYA, amount: '1474.76' },
    { from_user: NOA, to_user: MAYA, amount: '582.02' },
  ],
}

const GROUP = {
  id: 'g1',
  name: 'Dizengoff 5',
  type: 'SHARED_APARTMENT',
  currency: 'ILS',
  created_by: GAL.id,
  created_at: '2026-01-01T00:00:00Z',
  members: [GAL, MAYA, NOA].map((u) => ({
    user: u,
    role: u.id === GAL.id ? 'OWNER' : 'MEMBER',
    default_split_weight: '1',
    joined_at: '2026-01-01T00:00:00Z',
    left_at: null,
  })),
} as unknown as Group

function renderScreen(as = GAL) {
  window.localStorage.setItem('sw.token', 'tok')
  server.use(
    http.get(apiUrl('/api/auth/me'), () => HttpResponse.json(as)),
    http.get(apiUrl('/api/groups/g1/balances'), () => HttpResponse.json(BALANCES)),
    http.get(apiUrl('/api/groups/g1/settlement-plan'), () => HttpResponse.json(PLAN)),
  )

  const scope = {
    group: GROUP,
    groupId: 'g1',
    currency: 'ILS',
    activeMembers: GROUP.members,
    allMembers: GROUP.members,
    me: GROUP.members.find((m) => m.user.id === as.id),
    isOwner: as.id === GAL.id,
  }

  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <AuthProvider>
          <GroupContext value={scope}>
            <BalancesScreen />
          </GroupContext>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('balances', () => {
  it('leads with the action, not just a number', async () => {
    // The slab carries the transfer the viewer can actually do something
    // about -- Gal owes Maya, so that is the one with the button on it.
    renderScreen(GAL)
    expect(await screen.findByText(/You pay Maya\./)).toBeInTheDocument()
    expect(screen.getAllByText(/1,474\.76/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Record that this happened' })).toBeInTheDocument()
  })

  it("falls back to the biggest transfer when none of them is the viewer's", async () => {
    // Maya is nobody's payer: she is owed by both. The slab falls back to the
    // biggest transfer rather than showing her a button she cannot press.
    renderScreen(MAYA)
    expect(await screen.findByText(/Gal pays you\./)).toBeInTheDocument()
  })

  it('derives the transfer count rather than hardcoding it', async () => {
    renderScreen(GAL)
    expect(await screen.findByText(/2 transfers clear it/)).toBeInTheDocument()
  })

  it('shows the whole group, sorted richest creditor first', async () => {
    renderScreen(GAL)
    await screen.findByText('Who is up, who is down')
    const rows = screen.getAllByText(/^is owed$|^owes$|^square$/)
    expect(rows).toHaveLength(3)
    // Maya is the creditor and the API sorts her first.
    expect(rows[0]).toHaveTextContent('is owed')
  })

  it('calls the plan a suggestion, because recording a payment is what moves money', async () => {
    renderScreen(GAL)
    await screen.findByText('Who is up, who is down')
    expect(screen.getByText(/only a suggestion/)).toBeInTheDocument()
    expect(screen.getByText(/nothing changes until you record a payment/)).toBeInTheDocument()
  })

  it('names the payer and payee, and gets the verb right for "you"', async () => {
    // "You pays Maya" is what the first version said. A test that only asserts
    // the names would have kept saying it.
    renderScreen(GAL)
    expect(await screen.findByText(/Noa pays Maya/)).toBeInTheDocument()
    expect(screen.queryByText(/You pays/)).not.toBeInTheDocument()
  })

  it('prefills the plan amount but lets it be edited, because part payments happen', async () => {
    const person = userEvent.setup()
    renderScreen(GAL)
    await person.click(await screen.findByRole('button', { name: 'Record that this happened' }))

    expect(await screen.findByRole('heading', { name: 'Record a payment' })).toBeInTheDocument()
    expect(screen.getByLabelText(/How much/)).toHaveValue('1474.76')
  })

  it('only offers to nudge people who owe YOU', async () => {
    // The API refuses a reminder to anyone who does not owe you, so the button
    // must not appear where it would only produce a 400.
    renderScreen(GAL)
    await screen.findByText('Who is up, who is down')
    expect(screen.queryByRole('button', { name: /Nudge/ })).not.toBeInTheDocument()

    renderScreen(MAYA)
    expect(
      await screen.findByRole('button', { name: /Nudge everyone who owes you/ }),
    ).toBeInTheDocument()
  })
})

describe('when everyone is square', () => {
  it('says so instead of showing an empty list', async () => {
    window.localStorage.setItem('sw.token', 'tok')
    server.use(
      http.get(apiUrl('/api/auth/me'), () => HttpResponse.json(GAL)),
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
    )

    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter>
          <AuthProvider>
            <GroupContext
              value={{
                group: GROUP,
                groupId: 'g1',
                currency: 'ILS',
                activeMembers: GROUP.members,
                allMembers: GROUP.members,
                me: GROUP.members[0],
                isOwner: true,
              }}
            >
              <BalancesScreen />
            </GroupContext>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Everyone is square.')).toBeInTheDocument()
    expect(screen.getByText('square')).toBeInTheDocument()
  })
})
