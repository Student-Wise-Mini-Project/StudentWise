import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/api/queryClient'
import type { Group } from '@/api/types'
import { GroupContext } from '@/features/groups/groupContext'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { Locale } from '@/i18n/types'
import { apiUrl } from '@/test/apiUrl'
import { server } from '@/test/server'

import { AskScreen } from './AskScreen'
import { ExpenseAlerts } from './ExpenseAlerts'
import { WorthALook } from './WorthALook'

const person = (id: string, name: string) => ({
  id,
  name,
  email: `${name.toLowerCase()}@studentwise.dev`,
  phone_number: null,
  created_at: '2026-01-01T00:00:00Z',
})
const MAYA = person('u-maya', 'Maya')
const NOA = person('u-noa', 'Noa')

const GROUP = {
  id: 'g1',
  name: 'Dizengoff 5',
  type: 'SHARED_APARTMENT',
  currency: 'ILS',
  address: null,
  created_by: 'u-maya',
  created_at: '2026-01-01T00:00:00Z',
  archived_at: null,
  members: [],
} as unknown as Group

function renderIn(ui: React.ReactNode, locale: Locale = 'en') {
  return render(
    <I18nProvider locale={locale}>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter>
          <GroupContext
            value={{
              group: GROUP,
              groupId: 'g1',
              currency: 'ILS',
              activeMembers: [],
              allMembers: [],
              me: undefined,
              isOwner: true,
              isOpen: true,
            }}
          >
            {ui}
          </GroupContext>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
}

// --- 9.9 ask ------------------------------------------------------------------------

const ANSWER = {
  question: 'Who paid the most?',
  sql: 'SELECT u.name AS payer_name, SUM(e.total_amount) AS total_paid FROM ...',
  explanation: 'How much each person has paid out, highest first.',
  columns: ['payer_name', 'total_paid'],
  column_labels: { payer_name: 'Person', total_paid: 'Total paid' },
  rows: [
    { payer_name: 'Maya', total_paid: '3757.40' },
    { payer_name: 'Noa', total_paid: '1144.00' },
  ],
  row_count: 2,
  truncated: false,
}

function answering(respond: (body: { question: string; language: string }) => Response) {
  const sent: { question: string; language: string }[] = []
  server.use(
    http.post(apiUrl('/api/groups/g1/analytics/ask'), async ({ request }) => {
      const body = (await request.json()) as { question: string; language: string }
      sent.push(body)
      return respond(body)
    }),
  )
  return sent
}

describe('asking a question (9.9)', () => {
  it('a suggestion asks it, and the answer comes back as a table', async () => {
    const sent = answering(() => HttpResponse.json(ANSWER))
    renderIn(<AskScreen />)
    await userEvent.click(screen.getByRole('button', { name: 'Who paid the most?' }))

    expect(await screen.findByText(ANSWER.explanation)).toBeInTheDocument()
    expect(sent).toEqual([{ question: 'Who paid the most?', language: 'en' }])
    const table = screen.getByRole('table')
    // Headings the model wrote, not the SQL column names.
    expect(within(table).getByRole('columnheader', { name: 'Person' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Total paid' })).toBeInTheDocument()
    // A money column is shown as money.
    expect(within(table).getByText('₪3,757.40')).toBeInTheDocument()
    expect(screen.getByText('2 rows')).toBeInTheDocument()
  })

  it('asks for the answer in the language the app is shown in', async () => {
    const sent = answering(() => HttpResponse.json(ANSWER))
    renderIn(<AskScreen />, 'he')
    await userEvent.type(screen.getByLabelText('השאלה'), 'Who paid the most?')
    await userEvent.click(screen.getByRole('button', { name: 'שאלה' }))
    await waitFor(() => expect(sent).toEqual([{ question: 'Who paid the most?', language: 'he' }]))
  })

  it('shows the query that produced the answer, on request', async () => {
    answering(() => HttpResponse.json(ANSWER))
    renderIn(<AskScreen />)
    await userEvent.click(screen.getByRole('button', { name: 'Who paid the most?' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Show how it was worked out' }))
    expect(screen.getByText(/SELECT u\.name AS payer_name/)).toBeInTheDocument()
  })

  it('without an API key it says asking is not set up', async () => {
    answering(() => HttpResponse.json({ detail: 'not configured' }, { status: 503 }))
    renderIn(<AskScreen />)
    await userEvent.click(screen.getByRole('button', { name: 'Who paid the most?' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Asking questions isn't set up on this server yet.",
    )
  })

  it('a question the server refuses says why', async () => {
    answering(() =>
      HttpResponse.json({ detail: 'The generated query was rejected: DELETE' }, { status: 400 }),
    )
    renderIn(<AskScreen />)
    await userEvent.click(screen.getByRole('button', { name: 'Who paid the most?' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The generated query was rejected')
  })

  it('will not send a question of a word or two letters', async () => {
    renderIn(<AskScreen />)
    await userEvent.type(screen.getByLabelText('Your question'), 'hi')
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled()
  })
})

// --- 9.10 alerts ------------------------------------------------------------------------

const ANOMALY = {
  expense: {
    id: 'e-elec',
    title: 'Electricity bill',
    total_amount: '1244.00',
    expense_date: '2026-09-03',
    category: 'UTILITIES',
  },
  series_label: 'electricity bill',
  series_size: 7,
  baseline: '398.65',
  difference: '845.35',
  percent_change: '212.1',
  score: '9.2',
  direction: 'HIGH',
}

const side = (id: string, payer: typeof MAYA, date: string) => ({
  id,
  title: 'Internet',
  total_amount: '99.90',
  expense_date: date,
  category: 'UTILITIES',
  payer,
})

const PAIR = {
  score: '0.84',
  day_gap: 2,
  same_payer: false,
  reasons: ['English sentences the screen does not use'],
  first: side('e-net-1', MAYA, '2026-09-10'),
  second: side('e-net-2', NOA, '2026-09-12'),
}

function reports({ anomalies = [ANOMALY], pairs = [PAIR] } = {}) {
  server.use(
    http.get(apiUrl('/api/groups/g1/analytics/anomalies'), () =>
      HttpResponse.json({ group_id: 'g1', currency: 'ILS', anomalies }),
    ),
    http.get(apiUrl('/api/groups/g1/analytics/duplicates'), () =>
      HttpResponse.json({ group_id: 'g1', currency: 'ILS', window_days: 3, pairs }),
    ),
  )
}

describe('worth a look (9.10)', () => {
  it('shows an unusual expense against what it usually costs', async () => {
    reports({ pairs: [] })
    renderIn(<WorthALook />)
    const row = await screen.findByRole('link', { name: /Electricity bill/ })
    expect(row).toHaveAttribute('href', '/groups/g1/expenses/e-elec')
    expect(row).toHaveTextContent('usually ₪398.65')
    expect(row).toHaveTextContent('Unusually high · 212% more')
  })

  it('shows a suspected double payment, and says why in words', async () => {
    reports({ anomalies: [] })
    renderIn(<WorthALook />)
    expect(await screen.findByText('Possibly paid twice')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Same amount · Same name · 2 days apart · Two people paid — maybe covered twice',
      ),
    ).toBeInTheDocument()
    const links = screen.getAllByRole('link', { name: /Internet/ })
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/groups/g1/expenses/e-net-1',
      '/groups/g1/expenses/e-net-2',
    ])
  })

  it('explains it in Hebrew on the Hebrew screen', async () => {
    reports({ anomalies: [] })
    renderIn(<WorthALook />, 'he')
    expect(await screen.findByText('אולי שולם פעמיים')).toBeInTheDocument()
    expect(screen.getByText(/בהפרש של יומיים/)).toBeInTheDocument()
  })

  it('says nothing when there is nothing to say', async () => {
    reports({ anomalies: [], pairs: [] })
    renderIn(<WorthALook />)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByText('Worth a look')).not.toBeInTheDocument()
  })
})

describe('on the expense itself (9.10)', () => {
  it('an unusual expense says what it usually costs', async () => {
    reports()
    renderIn(<ExpenseAlerts expenseId="e-elec" />)
    expect(
      await screen.findByText("Unusually high for this kind of expense: it's usually ₪398.65."),
    ).toBeInTheDocument()
  })

  it('half of a suspected double payment points at the other half', async () => {
    reports()
    renderIn(<ExpenseAlerts expenseId="e-net-1" />)
    expect(await screen.findByText(/may be the same payment as/)).toHaveTextContent('paid by Noa')
    expect(screen.getByRole('link', { name: 'Open it' })).toHaveAttribute(
      'href',
      '/groups/g1/expenses/e-net-2',
    )
  })

  it('an ordinary expense shows nothing', async () => {
    reports()
    renderIn(<ExpenseAlerts expenseId="e-groceries" />)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})
