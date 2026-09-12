import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
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

const user = (id: string, name: string) => ({
  id,
  name,
  email: `${name.toLowerCase()}@studentwise.dev`,
  phone_number: null,
  created_at: '2026-01-01T00:00:00Z',
})

const MAYA = user('u-maya', 'Maya')
const NOA = user('u-noa', 'Noa')
const GAL = user('u-gal', 'Gal')

// Deliberately not first: the API's membership query has no ORDER BY, so the
// order this arrives in is whatever Postgres felt like.
const GROUP = {
  id: 'g1',
  name: 'Dizengoff 5',
  type: 'SHARED_APARTMENT',
  currency: 'ILS',
  created_by: MAYA.id,
  created_at: '2026-01-01T00:00:00Z',
  members: [MAYA, NOA, GAL].map((u) => ({
    user: u,
    role: u.id === MAYA.id ? 'OWNER' : 'MEMBER',
    default_split_weight: '1',
    joined_at: '2026-01-01T00:00:00Z',
    left_at: null,
  })),
}

function renderForm(as = GAL) {
  resetRunTracking()
  window.localStorage.setItem('sw.token', 'tok')
  server.use(
    http.get(apiUrl('/api/auth/me'), () => HttpResponse.json(as)),
    http.get(apiUrl('/api/groups/g1'), () => HttpResponse.json(GROUP)),
    http.get(apiUrl('/api/notifications/unread-count'), () => HttpResponse.json({ unread: 0 })),
    http.post(apiUrl('/api/groups/g1/recurring-bills/run'), () =>
      HttpResponse.json({ generated: [], awaiting_amount: [], reminded: [] }),
    ),
  )
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/groups/g1/expenses/new']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/**
 * Who paid is the one default that cannot be guessed wrong quietly.
 *
 * It used to be `members[0]`, and the group's member list arrives in no
 * particular order -- so a saved expense could be attributed to a flatmate, and
 * the balances would say you were owed money you had never spent.
 */
describe('the new-expense form', () => {
  it('defaults the payer to whoever is signed in', async () => {
    renderForm(GAL)
    expect(await screen.findByRole('button', { name: /paid by/i })).toHaveAccessibleName(/Gal/)
  })

  it('follows the signed-in user, not the position in the list', async () => {
    renderForm(NOA)
    expect(await screen.findByRole('button', { name: /paid by/i })).toHaveAccessibleName(/Noa/)
  })
})

/**
 * "Repeats" is the fast path into the recurring-bills feature: tick it while
 * adding this month's rent and the schedule sets itself up.
 */
describe('the repeats toggle', () => {
  function fillAndSave(overrides: { repeat?: string } = {}) {
    return async () => {
      await userEvent.type(await screen.findByLabelText('What was it?'), 'Rent')
      await userEvent.type(screen.getByLabelText('Amount'), '3600')
      await userEvent.clear(screen.getByLabelText('When?'))
      await userEvent.type(screen.getByLabelText('When?'), '2026-09-12')
      if (overrides.repeat) {
        await userEvent.selectOptions(screen.getByLabelText('Repeats'), overrides.repeat)
      }
      await userEvent.click(screen.getByRole('button', { name: 'Save expense' }))
    }
  }

  it('posts only the expense when it is left off', async () => {
    const bills: unknown[] = []
    renderForm()
    server.use(
      http.post(apiUrl('/api/groups/g1/expenses'), () =>
        HttpResponse.json({ id: 'e1', group_id: 'g1' }, { status: 201 }),
      ),
      http.post(apiUrl('/api/groups/g1/recurring-bills'), async ({ request }) => {
        bills.push(await request.json())
        return HttpResponse.json({}, { status: 201 })
      }),
    )

    await fillAndSave()()
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(bills).toEqual([])
  })

  it('starts the schedule one period after this expense, not on it', async () => {
    // first_due_on equal to this expense's own date would make tonight's run
    // post the same bill again -- and the unique index would turn that into a
    // 409 the next time anyone opened the group.
    const bills: Record<string, unknown>[] = []
    renderForm()
    server.use(
      http.post(apiUrl('/api/groups/g1/expenses'), () =>
        HttpResponse.json({ id: 'e1', group_id: 'g1' }, { status: 201 }),
      ),
      http.post(apiUrl('/api/groups/g1/recurring-bills'), async ({ request }) => {
        bills.push((await request.json()) as Record<string, unknown>)
        return HttpResponse.json({}, { status: 201 })
      }),
    )

    await fillAndSave({ repeat: 'MONTHLY' })()

    await waitFor(() => expect(bills).toHaveLength(1))
    expect(bills[0]).toMatchObject({
      title: 'Rent',
      frequency: 'MONTHLY',
      first_due_on: '2026-10-12',
      // Normalised by MoneyInput, and a string all the way down.
      amount: '3600.00',
    })
  })

  it('keeps the expense and says so when the schedule could not be set up', async () => {
    // Two requests, not one transaction. A silent half-success would mean a
    // bill that quietly never recurs, found out the month it was needed.
    renderForm()
    server.use(
      http.post(apiUrl('/api/groups/g1/expenses'), () =>
        HttpResponse.json({ id: 'e1', group_id: 'g1' }, { status: 201 }),
      ),
      http.post(apiUrl('/api/groups/g1/recurring-bills'), () =>
        HttpResponse.json({ detail: 'Nope' }, { status: 500 }),
      ),
    )

    await fillAndSave({ repeat: 'MONTHLY' })()
    expect(await screen.findByText(/repeat wasn't set up/i)).toBeInTheDocument()
  })
})
