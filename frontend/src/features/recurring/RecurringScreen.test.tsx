import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
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

import { RecurringScreen } from './RecurringScreen'

const GAL = {
  id: 'u-gal',
  name: 'Gal',
  email: 'gal@studentwise.dev',
  phone_number: null,
  created_at: '2026-01-01T00:00:00Z',
}
const MAYA = { ...GAL, id: 'u-maya', name: 'Maya', email: 'maya@studentwise.dev' }

function bill(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    group_id: 'g1',
    title: 'Rent',
    amount: '3600.00',
    category: 'RENT',
    payer: GAL,
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
    ...overrides,
  }
}

const GROUP = {
  id: 'g1',
  name: 'Dizengoff 5',
  type: 'SHARED_APARTMENT',
  currency: 'ILS',
  created_by: GAL.id,
  created_at: '2026-01-01T00:00:00Z',
  archived_at: null,
  members: [GAL, MAYA].map((u) => ({
    user: u,
    role: u.id === GAL.id ? 'OWNER' : 'MEMBER',
    default_split_weight: '1',
    joined_at: '2026-01-01T00:00:00Z',
    left_at: null,
  })),
} as unknown as Group

function renderScreen(bills: ReturnType<typeof bill>[], { isOpen = true } = {}) {
  window.localStorage.setItem('sw.token', 'tok')
  server.use(
    http.get(apiUrl('/api/auth/me'), () => HttpResponse.json(GAL)),
    http.get(apiUrl('/api/groups/g1/recurring-bills'), () => HttpResponse.json(bills)),
  )

  const scope = {
    group: GROUP,
    groupId: 'g1',
    currency: 'ILS',
    activeMembers: GROUP.members,
    allMembers: GROUP.members,
    me: GROUP.members[0],
    isOwner: true,
    isOpen,
  }

  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <AuthProvider>
          <GroupContext value={scope}>
            <RecurringScreen />
          </GroupContext>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('the recurring bills screen', () => {
  it('shows a fixed bill with its amount and when it next falls due', async () => {
    renderScreen([bill()])
    expect(await screen.findByText('Rent')).toBeInTheDocument()
    expect(screen.getByText(/3,600\.00/)).toBeInTheDocument()
    expect(screen.getByText(/Monthly/)).toBeInTheDocument()
  })

  it('says "Varies" instead of an amount when the bill has none', async () => {
    // The distinction the whole feature turns on: rent posts itself, the
    // electricity waits for somebody to read the meter.
    renderScreen([bill({ id: 'b2', title: 'Electricity', amount: null, posts_itself: false })])

    expect(await screen.findByText('Electricity')).toBeInTheDocument()
    expect(screen.getByText('Varies')).toBeInTheDocument()
  })

  it('offers to post a varying bill, with an amount to type', async () => {
    renderScreen([bill({ id: 'b2', title: 'Electricity', amount: null, posts_itself: false })])

    await userEvent.click(await screen.findByRole('button', { name: 'Post now' }))
    const sheet = within(await screen.findByRole('dialog'))
    expect(sheet.getByLabelText(/How much this time/)).toBeInTheDocument()
  })

  it('shows a paused bill as paused, and offers to resume it', async () => {
    renderScreen([bill({ active: false })])
    // One text node inside the subtitle, beside the frequency.
    expect(await screen.findByText(/Paused/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument()
  })

  it('empty until somebody sets one up', async () => {
    renderScreen([])
    expect(await screen.findByText('Nothing repeats yet')).toBeInTheDocument()
  })

  it('offers nothing to write on a closed group', async () => {
    // A closed group's API refuses all of these, and a button that 409s is
    // worse than no button.
    renderScreen([bill()], { isOpen: false })

    await waitFor(() => expect(screen.getByText('Rent')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'New bill' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Post now' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
  })
})
