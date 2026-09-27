import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
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

import { InsightsScreen } from './InsightsScreen'

const person = (id: string, name: string) => ({
  id,
  name,
  email: `${name.toLowerCase()}@studentwise.dev`,
  phone_number: null,
  created_at: '2026-01-01T00:00:00Z',
})

const GAL = person('u-gal', 'Gal')
const MAYA = person('u-maya', 'Maya')

// The real figures from `python seed.py`.
const GROUP_SUMMARY = {
  group_id: 'g1',
  currency: 'ILS',
  scope: 'group',
  total_spent: '5303.20',
  expense_count: 18,
  average_expense: '294.62',
  largest_expense: {
    id: 'e-big',
    title: 'Electricity bill',
    total_amount: '1244.00',
    expense_date: '2026-08-05',
    category: 'UTILITIES',
  },
  first_expense_date: '2026-03-05',
  last_expense_date: '2026-09-08',
}

const MY_SUMMARY = { ...GROUP_SUMMARY, scope: 'user', total_spent: '1776.56' }

const BY_CATEGORY = {
  group_id: 'g1',
  currency: 'ILS',
  scope: 'group',
  total: '5303.20',
  categories: [
    { category: 'UTILITIES', total: '4657.90', expense_count: 14, share_percent: '87.8' },
    { category: 'GROCERIES', total: '401.80', expense_count: 2, share_percent: '7.6' },
    { category: null, total: '100.00', expense_count: 1, share_percent: '1.9' },
    // A zero slice: the API can return one, and it has no arc to draw.
    { category: 'RENT', total: '0.00', expense_count: 0, share_percent: '0.0' },
  ],
}

const BY_MONTH = {
  group_id: 'g1',
  currency: 'ILS',
  scope: 'group',
  months: [
    { month: '2026-07', total: '545.50', expense_count: 2 },
    { month: '2026-08', total: '1397.20', expense_count: 2 },
    { month: '2026-09', total: '1177.30', expense_count: 6 },
  ],
}

const BY_MEMBER = {
  group_id: 'g1',
  currency: 'ILS',
  members: [
    { user: MAYA, paid: '3757.40', consumed: '1800.62' },
    { user: GAL, paid: '401.80', consumed: '1776.56' },
  ],
}

const GROUP = {
  id: 'g1',
  name: 'Dizengoff 5',
  type: 'SHARED_APARTMENT',
  currency: 'ILS',
  created_by: GAL.id,
  created_at: '2026-01-01T00:00:00Z',
  members: [GAL, MAYA].map((u) => ({
    user: u,
    role: 'MEMBER',
    default_split_weight: '1',
    joined_at: '2026-01-01T00:00:00Z',
    left_at: null,
  })),
} as unknown as Group

/** Records the `user_id` each analytics call was made with. */
function renderScreen() {
  const scopes: (string | null)[] = []
  window.localStorage.setItem('sw.token', 'tok')

  server.use(
    // The unusual-expense and double-payment reports (9.10); nothing to flag here.
    http.get(apiUrl('/api/groups/g1/analytics/anomalies'), () =>
      HttpResponse.json({ group_id: 'g1', currency: 'ILS', anomalies: [] }),
    ),
    http.get(apiUrl('/api/groups/g1/analytics/duplicates'), () =>
      HttpResponse.json({ group_id: 'g1', currency: 'ILS', window_days: 3, pairs: [] }),
    ),
    http.get(apiUrl('/api/auth/me'), () => HttpResponse.json(GAL)),
    http.get(apiUrl('/api/groups/g1/analytics/summary'), ({ request }) => {
      const userId = new URL(request.url).searchParams.get('user_id')
      scopes.push(userId)
      return HttpResponse.json(userId ? MY_SUMMARY : GROUP_SUMMARY)
    }),
    http.get(apiUrl('/api/groups/g1/analytics/by-category'), () => HttpResponse.json(BY_CATEGORY)),
    http.get(apiUrl('/api/groups/g1/analytics/by-month'), () => HttpResponse.json(BY_MONTH)),
    http.get(apiUrl('/api/groups/g1/analytics/by-member'), () => HttpResponse.json(BY_MEMBER)),
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
              isOwner: false,
              isOpen: true,
            }}
          >
            <InsightsScreen />
          </GroupContext>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  return { scopes, user: userEvent.setup() }
}

describe('insights', () => {
  it('shows the group total and what it is made of', async () => {
    renderScreen()
    expect(await screen.findByText('Total spent')).toBeInTheDocument()
    expect(screen.getAllByText(/5,303\.20/).length).toBeGreaterThan(0)
    // "Utilities" appears twice: the donut legend and the biggest-expense badge.
    expect(screen.getAllByText('Utilities').length).toBeGreaterThan(0)
    expect(screen.getByText('87.8%')).toBeInTheDocument()
  })

  it('calls an uncategorised slice "Uncategorised" rather than showing null', async () => {
    renderScreen()
    expect(await screen.findByText('Uncategorised')).toBeInTheDocument()
  })

  it('leaves out a zero slice, which has no arc to draw', async () => {
    renderScreen()
    await screen.findByText('87.8%')
    expect(screen.queryByText('Rent')).not.toBeInTheDocument()
    expect(screen.queryByText('0.0%')).not.toBeInTheDocument()
  })

  it('switches the API scope, because the numbers mean different things', async () => {
    // "The group spent 5,303" and "I consumed 1,776" are different sentences.
    // Getting this wrong is how somebody concludes they are being overcharged.
    const { scopes, user } = renderScreen()
    await screen.findByText('Total spent')
    expect(scopes).toEqual([null])

    await user.click(screen.getByRole('radio', { name: 'Just me' }))

    await waitFor(() => expect(scopes).toContain('u-gal'))
    expect(await screen.findByText('Your share')).toBeInTheDocument()
    expect(screen.getAllByText(/1,776\.56/).length).toBeGreaterThan(0)
  })

  it('names the peak month with its actual amount', async () => {
    renderScreen()
    // The amount is in the visible caption and again in the screen-reader table.
    const peak = await screen.findByText(/August 2026/)
    expect(peak).toHaveTextContent(/1,397\.20/)
  })

  it('says the per-member chart is spending, not debt', async () => {
    // paid − consumed is *not* what someone is owed: settlements are not in it.
    // Without this line the chart quietly contradicts the balances screen.
    renderScreen()
    expect(await screen.findByText(/This is spending, not debt/)).toBeInTheDocument()
    expect(screen.getByText(/Balances/)).toBeInTheDocument()
  })

  it('gives screen readers the numbers, not just the shapes', async () => {
    renderScreen()
    expect(await screen.findByText('Spending per month')).toBeInTheDocument()
    expect(screen.getByText('Paid and consumed per person')).toBeInTheDocument()
    // Every month is in the table even though only the peak is labelled on the chart.
    const table = screen.getByText('Spending per month').closest('table')
    expect(table?.textContent).toContain('545.50')
    expect(table?.textContent).toContain('1,177.30')
  })
})

describe('a group with nothing in it', () => {
  it('says so instead of drawing empty charts', async () => {
    window.localStorage.setItem('sw.token', 'tok')
    server.use(
      http.get(apiUrl('/api/auth/me'), () => HttpResponse.json(GAL)),
      http.get(apiUrl('/api/groups/g1/analytics/anomalies'), () =>
        HttpResponse.json({ group_id: 'g1', currency: 'ILS', anomalies: [] }),
      ),
      http.get(apiUrl('/api/groups/g1/analytics/duplicates'), () =>
        HttpResponse.json({ group_id: 'g1', currency: 'ILS', window_days: 3, pairs: [] }),
      ),
      http.get(apiUrl('/api/groups/g1/analytics/summary'), () =>
        HttpResponse.json({
          ...GROUP_SUMMARY,
          total_spent: '0.00',
          expense_count: 0,
          average_expense: '0.00',
          largest_expense: null,
          first_expense_date: null,
          last_expense_date: null,
        }),
      ),
      http.get(apiUrl('/api/groups/g1/analytics/by-category'), () =>
        HttpResponse.json({ ...BY_CATEGORY, total: '0.00', categories: [] }),
      ),
      http.get(apiUrl('/api/groups/g1/analytics/by-month'), () =>
        HttpResponse.json({ ...BY_MONTH, months: [] }),
      ),
      http.get(apiUrl('/api/groups/g1/analytics/by-member'), () =>
        HttpResponse.json({ ...BY_MEMBER, members: [] }),
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
                isOwner: false,
                isOpen: true,
              }}
            >
              <InsightsScreen />
            </GroupContext>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Nothing to chart yet')).toBeInTheDocument()
  })
})
