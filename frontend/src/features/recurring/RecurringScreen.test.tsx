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
    occurrences_total: null,
    occurrences_done: 0,
    is_finished: false,
    occurrences_remaining: null,
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

  it('marks a bill that has already come due', async () => {
    // This is what makes RunResult.awaiting_amount visible: a varying bill
    // that is due has nothing to post itself with and is waiting on a person.
    // "Next 1 Oct" on a bill that was due in March says the opposite.
    renderScreen([
      bill({ title: 'Electricity', amount: null, posts_itself: false, next_due_on: '2020-01-01' }),
    ])

    expect(await screen.findByText(/Due now/)).toBeInTheDocument()
  })

  it('does not mark one that is still in the future', async () => {
    renderScreen([bill({ next_due_on: '2099-01-01' })])
    expect(await screen.findByText(/Next/)).toBeInTheDocument()
    expect(screen.queryByText(/Due now/)).not.toBeInTheDocument()
  })

  it('shows how far through a counted bill is', async () => {
    renderScreen([bill({ occurrences_total: 12, occurrences_done: 3, occurrences_remaining: 9 })])
    expect(await screen.findByText('3 of 12')).toBeInTheDocument()
  })

  it('shows a spent bill as finished, and stops offering to post it', async () => {
    // The count is there to stop a thirteenth rent. A Post now button on a
    // finished bill would be a button that 409s.
    renderScreen([
      bill({
        occurrences_total: 12,
        occurrences_done: 12,
        occurrences_remaining: 0,
        is_finished: true,
      }),
    ])

    expect(await screen.findByText(/Finished/)).toBeInTheDocument()
    expect(screen.getByText('12 of 12')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Post now' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
    // Still editable, so the number can be raised to extend it.
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('says nothing about a count on an unlimited bill', async () => {
    renderScreen([bill()])
    await screen.findByText('Rent')
    expect(screen.queryByText(/ of /)).not.toBeInTheDocument()
  })

  it('empty until somebody sets one up', async () => {
    renderScreen([])
    expect(await screen.findByText('Nothing repeats yet')).toBeInTheDocument()
  })

  it('sends the count when a set number of times is asked for', async () => {
    const sent: Record<string, unknown>[] = []
    renderScreen([])
    server.use(
      http.post(apiUrl('/api/groups/g1/recurring-bills'), async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>)
        return HttpResponse.json(bill(), { status: 201 })
      }),
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Set one up' }))
    const sheet = within(await screen.findByRole('dialog'))
    await userEvent.type(sheet.getByLabelText(/What is it/), 'Rent')
    await userEvent.type(sheet.getByLabelText(/How much/), '3600')
    await userEvent.click(sheet.getByLabelText(/Repeat a set number of times/))

    const count = sheet.getByLabelText(/How many times/)
    await userEvent.clear(count)
    await userEvent.type(count, '12')
    await userEvent.click(sheet.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({ title: 'Rent', occurrences_total: 12 })
  })

  it('leaves the count out when it is not asked for', async () => {
    const sent: Record<string, unknown>[] = []
    renderScreen([])
    server.use(
      http.post(apiUrl('/api/groups/g1/recurring-bills'), async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>)
        return HttpResponse.json(bill(), { status: 201 })
      }),
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Set one up' }))
    const sheet = within(await screen.findByRole('dialog'))
    await userEvent.type(sheet.getByLabelText(/What is it/), 'Rent')
    await userEvent.type(sheet.getByLabelText(/How much/), '3600')
    await userEvent.click(sheet.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]?.occurrences_total).toBeNull()
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
