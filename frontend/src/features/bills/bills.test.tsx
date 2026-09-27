import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/api/queryClient'
import type { Group, IngestedBill } from '@/api/types'
import { GroupContext } from '@/features/groups/groupContext'
import { FlatAddressSection } from '@/features/groups/FlatAddressSection'
import { I18nProvider } from '@/i18n/I18nProvider'
import { apiUrl } from '@/test/apiUrl'
import { server } from '@/test/server'

import { BillsScreen } from './BillsScreen'
import { GmailSection } from './GmailSection'
import { PendingBillsBanner } from './PendingBillsBanner'
import { resetGmailSyncTracking } from './api'

const FLAT = {
  id: 'g1',
  name: 'Dizengoff 5',
  type: 'SHARED_APARTMENT',
  currency: 'ILS',
  address: null,
  created_by: 'u-gal',
  created_at: '2026-01-01T00:00:00Z',
  archived_at: null,
  members: [],
}
const OTHER_FLAT = { ...FLAT, id: 'g2', name: 'Florentin 22' }

function bill(overrides: Partial<IngestedBill> = {}): IngestedBill {
  return {
    id: 'b1',
    status: 'PENDING_REVIEW',
    review_reason: 'UNKNOWN_SENDER',
    sender: 'billing@totally-real-bills.com',
    subject: 'חשבון לתשלום',
    received_at: '2026-09-20T08:00:00Z',
    provider_name: 'חברת החשמל',
    total_amount: '412.30',
    currency: 'ILS',
    due_date: '2026-10-15',
    billed_to_name: null,
    service_address: 'דיזנגוף 5 תל אביב',
    invoice_number: '123',
    category: 'UTILITIES',
    group: { id: 'g1', name: 'Dizengoff 5', currency: 'ILS' },
    address_score: null,
    expense_id: null,
    created_at: '2026-09-20T08:00:00Z',
    ...overrides,
  }
}

const page = (items: IngestedBill[]) => ({
  items,
  total: items.length,
  limit: 50,
  offset: 0,
  has_more: false,
})

function renderIn(ui: React.ReactNode, path = '/') {
  return render(
    <I18nProvider locale="en">
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
}

beforeEach(() => {
  window.localStorage.setItem('sw.token', 'tok')
  resetGmailSyncTracking()
})

// --- the review screen -----------------------------------------------------------

describe('bills to review', () => {
  function withBills(bills: IngestedBill[]) {
    const calls: { approved: unknown[]; dismissed: string[] } = { approved: [], dismissed: [] }
    let remaining = bills
    server.use(
      http.get(apiUrl('/api/bills'), () => HttpResponse.json(page(remaining))),
      http.get(apiUrl('/api/groups'), () => HttpResponse.json([FLAT, OTHER_FLAT])),
      http.post(apiUrl('/api/bills/:id/approve'), async ({ request, params }) => {
        calls.approved.push(await request.json())
        remaining = remaining.filter((b) => b.id !== params.id)
        return HttpResponse.json({ id: 'e1' })
      }),
      http.post(apiUrl('/api/bills/:id/dismiss'), ({ params }) => {
        calls.dismissed.push(params.id as string)
        remaining = remaining.filter((b) => b.id !== params.id)
        return HttpResponse.json({ ...bills[0], status: 'DISMISSED' })
      }),
    )
    renderIn(<BillsScreen />)
    return calls
  }

  it('says why each bill is waiting', async () => {
    withBills([bill()])
    expect(
      await screen.findByText(/The sender isn't a known utility, so it wasn't split/),
    ).toBeInTheDocument()
    expect(screen.getByText(/^Due .*2026/)).toBeInTheDocument()
  })

  it('preselects the suggested flat and splits it there', async () => {
    const calls = withBills([bill()])
    const card = await screen.findByRole('article', { name: 'חברת החשמל' })
    expect(within(card).getByRole('combobox')).toHaveValue('g1')

    await userEvent.click(within(card).getByRole('button', { name: 'Split it' }))

    await waitFor(() => expect(calls.approved).toEqual([{ group_id: 'g1' }]))
    expect(await screen.findByText('Nothing to review')).toBeInTheDocument()
  })

  it('can be split in a different flat', async () => {
    const calls = withBills([bill()])
    const card = await screen.findByRole('article', { name: 'חברת החשמל' })
    await userEvent.selectOptions(within(card).getByRole('combobox'), 'g2')
    await userEvent.click(within(card).getByRole('button', { name: 'Split it' }))
    await waitFor(() => expect(calls.approved).toEqual([{ group_id: 'g2' }]))
  })

  it('needs the amount typed in when it could not be read', async () => {
    const calls = withBills([
      bill({ review_reason: 'UNREADABLE', total_amount: null, provider_name: null }),
    ])
    const card = await screen.findByRole('article', { name: 'חשבון לתשלום' })
    const split = within(card).getByRole('button', { name: 'Split it' })
    expect(split).toBeDisabled()

    await userEvent.type(within(card).getByLabelText('Bill amount'), '388.1')
    await userEvent.tab()
    await userEvent.click(split)
    await waitFor(() =>
      expect(calls.approved).toEqual([{ group_id: 'g1', total_amount: '388.10' }]),
    )
  })

  it('can be dismissed', async () => {
    const calls = withBills([bill()])
    const card = await screen.findByRole('article', { name: 'חברת החשמל' })
    await userEvent.click(within(card).getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(calls.dismissed).toEqual(['b1']))
  })

  it('shows a calm empty state', async () => {
    withBills([])
    expect(await screen.findByText('Nothing to review')).toBeInTheDocument()
  })
})

// --- settings -------------------------------------------------------------------------

describe('the Gmail section in settings', () => {
  const assign = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('location', { ...window.location, assign })
    assign.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  function status(body: object) {
    server.use(http.get(apiUrl('/api/integrations/gmail'), () => HttpResponse.json(body)))
  }

  it('offers to connect, and sends the browser to Google', async () => {
    status({ available: true, connected: false, needs_reconnect: false })
    server.use(
      http.post(apiUrl('/api/integrations/gmail/connect'), () =>
        HttpResponse.json({ authorization_url: 'https://accounts.google.test/consent' }),
      ),
    )
    renderIn(<GmailSection />)
    await userEvent.click(await screen.findByRole('button', { name: 'Connect Gmail' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://accounts.google.test/consent'))
  })

  it('explains when the server has no Gmail set up', async () => {
    status({ available: false, connected: false, needs_reconnect: false })
    renderIn(<GmailSection />)
    expect(await screen.findByText("Gmail isn't set up on this server yet.")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Connect Gmail' })).not.toBeInTheDocument()
  })

  it('checks for bills on demand and reports what happened', async () => {
    status({
      available: true,
      connected: true,
      google_email: 'gal.home@gmail.com',
      last_synced_at: null,
      needs_reconnect: false,
    })
    server.use(
      http.get(apiUrl('/api/bills'), () => HttpResponse.json(page([bill()]))),
      http.post(apiUrl('/api/integrations/gmail/sync'), () =>
        HttpResponse.json({
          checked: 3,
          imported: 1,
          needs_review: 1,
          skipped: 1,
          needs_reconnect: false,
        }),
      ),
    )
    renderIn(<GmailSection />)
    expect(await screen.findByText(/gal\.home@gmail\.com/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Check for bills now' }))
    expect(await screen.findByText('Checked 3: 1 split, 1 to review.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Bills to review/ })).toHaveTextContent('1')
  })

  it('asks to connect again when Google stopped accepting it', async () => {
    status({
      available: true,
      connected: true,
      google_email: 'gal.home@gmail.com',
      needs_reconnect: true,
    })
    server.use(http.get(apiUrl('/api/bills'), () => HttpResponse.json(page([]))))
    renderIn(<GmailSection />)
    expect(await screen.findByText(/Connect again to keep fetching bills/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect again' })).toBeInTheDocument()
  })

  it('says how connecting went after Google sends the browser back', async () => {
    status({ available: true, connected: false, needs_reconnect: false })
    renderIn(<GmailSection />, '/settings?gmail=denied')
    expect(
      await screen.findByText("Gmail wasn't connected: access was not allowed.", { exact: false }),
    ).toBeInTheDocument()
  })
})

// --- home ----------------------------------------------------------------------------

describe('the home screen banner', () => {
  it('fetches new bills once, then says how many wait', async () => {
    let syncs = 0
    server.use(
      http.get(apiUrl('/api/integrations/gmail'), () =>
        HttpResponse.json({ available: true, connected: true, needs_reconnect: false }),
      ),
      http.post(apiUrl('/api/integrations/gmail/sync'), () => {
        syncs += 1
        return HttpResponse.json({
          checked: 2,
          imported: 0,
          needs_review: 2,
          skipped: 0,
          needs_reconnect: false,
        })
      }),
      http.get(apiUrl('/api/bills'), () => HttpResponse.json(page([bill(), bill({ id: 'b2' })]))),
    )
    const first = renderIn(<PendingBillsBanner />)
    expect(
      await screen.findByRole('link', { name: '2 bills from your email to review' }),
    ).toHaveAttribute('href', '/bills')
    first.unmount()

    renderIn(<PendingBillsBanner />)
    await screen.findByRole('link', { name: '2 bills from your email to review' })
    expect(syncs).toBe(1)
  })

  it('stays out of the way for someone who never connected Gmail', async () => {
    let asked = false
    server.use(
      http.get(apiUrl('/api/integrations/gmail'), () =>
        HttpResponse.json({ available: true, connected: false, needs_reconnect: false }),
      ),
      http.post(apiUrl('/api/integrations/gmail/sync'), () => {
        asked = true
        return HttpResponse.json({})
      }),
    )
    renderIn(<PendingBillsBanner />)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(asked).toBe(false)
  })
})

// --- the flat's address ----------------------------------------------------------------

describe('the flat address', () => {
  function renderAddress({ owner = true, type = 'SHARED_APARTMENT' } = {}) {
    const saved: unknown[] = []
    server.use(
      http.patch(apiUrl('/api/groups/g1'), async ({ request }) => {
        saved.push(await request.json())
        return HttpResponse.json(FLAT)
      }),
    )
    const group = { ...FLAT, type } as unknown as Group
    renderIn(
      <GroupContext
        value={{
          group,
          groupId: 'g1',
          currency: 'ILS',
          activeMembers: [],
          allMembers: [],
          me: undefined,
          isOwner: owner,
          isOpen: true,
        }}
      >
        <FlatAddressSection />
      </GroupContext>,
    )
    return saved
  }

  it('lets an owner save it', async () => {
    const saved = renderAddress()
    await userEvent.type(screen.getByLabelText('Flat address'), 'דיזנגוף 5, תל אביב')
    await userEvent.click(screen.getByRole('button', { name: 'Save address' }))
    await waitFor(() => expect(saved).toEqual([{ address: 'דיזנגוף 5, תל אביב' }]))
  })

  it('is read-only for everyone else', () => {
    renderAddress({ owner: false })
    expect(screen.queryByLabelText('Flat address')).not.toBeInTheDocument()
    expect(screen.getByText('No address yet.')).toBeInTheDocument()
  })

  it('is not offered for a trip', () => {
    renderAddress({ type: 'TRIP' })
    expect(screen.queryByText('Address')).not.toBeInTheDocument()
  })
})
