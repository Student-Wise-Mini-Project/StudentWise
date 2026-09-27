import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/api/queryClient'
import type { ReceiptScan } from '@/api/types'
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

const GAL = user('u-gal', 'Gal')
const MAYA = user('u-maya', 'Maya')
const NOA = user('u-noa', 'Noa')

const GROUP = {
  id: 'g1',
  name: 'Dizengoff 5',
  type: 'SHARED_APARTMENT',
  currency: 'ILS',
  created_by: GAL.id,
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  members: [GAL, MAYA, NOA].map((u) => ({
    user: u,
    role: u.id === GAL.id ? 'OWNER' : 'MEMBER',
    default_split_weight: '1',
    joined_at: '2026-01-01T00:00:00Z',
    left_at: null,
  })),
}

const SCAN: ReceiptScan = {
  merchant: 'Shufersal',
  expense_date: '2026-09-20',
  total_amount: '54.00',
  currency: 'ILS',
  category: 'GROCERIES',
  lines: [
    { name: 'Milk', amount: '30.00' },
    { name: 'Wine', amount: '20.00' },
    { name: 'Hummus', amount: '10.00' },
  ],
  warnings: [],
  ai_metadata: { ocr: { model: 'claude-opus-5' } },
}

const PHOTO = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'receipt.jpg', {
  type: 'image/jpeg',
})

type Captured = { created: Record<string, unknown>[]; attached: string[]; previews: unknown[] }

function renderScan({
  scan = SCAN,
  scanStatus = 200,
  attachStatus = 200,
}: { scan?: ReceiptScan | { detail: string }; scanStatus?: number; attachStatus?: number } = {}) {
  resetRunTracking()
  window.localStorage.setItem('sw.token', 'tok')
  const captured: Captured = { created: [], attached: [], previews: [] }

  server.use(
    // The unusual-expense and double-payment reports (9.10); nothing to flag here.
    http.get(apiUrl('/api/groups/g1/analytics/anomalies'), () =>
      HttpResponse.json({ group_id: 'g1', currency: 'ILS', anomalies: [] }),
    ),
    http.get(apiUrl('/api/groups/g1/analytics/duplicates'), () =>
      HttpResponse.json({ group_id: 'g1', currency: 'ILS', window_days: 3, pairs: [] }),
    ),
    http.get(apiUrl('/api/auth/me'), () => HttpResponse.json(GAL)),
    http.get(apiUrl('/api/groups/g1'), () => HttpResponse.json(GROUP)),
    // The desktop side navigation lists groups and where you stand in each.
    http.get(apiUrl('/api/groups'), () => HttpResponse.json([GROUP])),
    http.get(apiUrl('/api/groups/g1/balances'), () =>
      HttpResponse.json({ group_id: 'g1', currency: 'ILS', balances: [] }),
    ),
    http.get(apiUrl('/api/notifications/unread-count'), () => HttpResponse.json({ unread: 0 })),
    http.post(apiUrl('/api/groups/g1/recurring-bills/run'), () =>
      HttpResponse.json({ generated: [], awaiting_amount: [], reminded: [] }),
    ),
    http.post(apiUrl('/api/groups/g1/receipts/scan'), () =>
      HttpResponse.json(scan, { status: scanStatus }),
    ),
    http.post(apiUrl('/api/groups/g1/expenses/item-preview'), async ({ request }) => {
      const body = (await request.json()) as { items: { user_ids: string[] }[] }
      captured.previews.push(body)
      // A canned answer: these tests are about what the screen sends and shows,
      // and the arithmetic has its own tests on the server.
      return HttpResponse.json({
        splits: [
          { user_id: GAL.id, owed_amount: '24.00' },
          { user_id: MAYA.id, owed_amount: '15.00' },
          { user_id: NOA.id, owed_amount: '15.00' },
        ],
        items_total: '60.00',
        adjustment: '-6.00',
      })
    }),
    http.post(apiUrl('/api/groups/g1/expenses'), async ({ request }) => {
      captured.created.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json({ id: 'e1', group_id: 'g1' }, { status: 201 })
    }),
    http.put(apiUrl('/api/expenses/e1/receipt'), () => {
      captured.attached.push('e1')
      return attachStatus === 200
        ? HttpResponse.json({ id: 'e1' })
        : HttpResponse.json({ detail: 'Storage is down' }, { status: attachStatus })
    }),
    // Where Save lands.
    http.get(apiUrl('/api/expenses/e1'), () =>
      HttpResponse.json({
        id: 'e1',
        group_id: 'g1',
        payer: GAL,
        title: 'Shufersal',
        total_amount: '54.00',
        category: 'GROCERIES',
        expense_date: '2026-09-20',
        split_type: 'EXACT',
        source: 'OCR',
        notes: null,
        ai_metadata: null,
        split_rule: null,
        created_by: GAL.id,
        created_at: '2026-09-27T10:00:00Z',
        updated_at: '2026-09-27T10:00:00Z',
        splits: [],
        items: [],
        receipt_url: null,
      }),
    ),
    http.get(apiUrl('/api/expenses/e1/comments'), () =>
      HttpResponse.json({ items: [], total: 0, limit: 50, offset: 0, has_more: false }),
    ),
  )

  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/groups/g1/expenses/scan']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return captured
}

async function photograph() {
  await screen.findByRole('heading', { name: 'Photograph the receipt' })
  await userEvent.upload(screen.getByTestId('receipt-camera-input'), PHOTO)
}

describe('scanning a receipt', () => {
  it('shows what was read for checking, nothing saved yet', async () => {
    const captured = renderScan()
    await photograph()

    expect(await screen.findByLabelText('Line 1 name')).toHaveValue('Milk')
    expect(screen.getByLabelText('Line 2 name')).toHaveValue('Wine')
    expect(screen.getByLabelText('Line 3 name')).toHaveValue('Hummus')
    expect(screen.getByLabelText('What was it?')).toHaveValue('Shufersal')
    expect(screen.getByText('Discount, shared in proportion')).toBeInTheDocument()
    expect(captured.created).toEqual([])
  })

  it('says what could not be read', async () => {
    renderScan({
      scan: { ...SCAN, warnings: ['TOTAL_MISSING', 'CURRENCY_MISMATCH'], currency: 'EUR' },
    })
    await photograph()

    expect(await screen.findByText(/total couldn't be read/i)).toBeInTheDocument()
    expect(screen.getByText(/looks like it is in EUR, but the group is in ILS/)).toBeInTheDocument()
  })

  it('offers another photo when the scan fails', async () => {
    renderScan({ scan: { detail: 'That photo does not look like a receipt' }, scanStatus: 400 })
    await photograph()

    expect(await screen.findByRole('alert')).toHaveTextContent('does not look like a receipt')
    expect(screen.getByRole('button', { name: 'Try another photo' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Type it in instead' })).toBeInTheDocument()
  })

  it('will not go on while a line is zero', async () => {
    renderScan()
    await photograph()

    const amount = await screen.findByLabelText('Line 2 amount')
    await userEvent.clear(amount)
    await userEvent.type(amount, '0')
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Next: who had what' })).toBeDisabled()
    expect(screen.getByText('Every line needs an amount above zero.')).toBeInTheDocument()
  })

  it('will not go on with no lines at all', async () => {
    renderScan()
    await photograph()

    for (const n of [3, 2, 1]) {
      await userEvent.click(await screen.findByRole('button', { name: `Remove line ${n}` }))
    }
    expect(screen.getByRole('button', { name: 'Next: who had what' })).toBeDisabled()
    expect(screen.getByText('Add at least one line.')).toBeInTheDocument()
  })
})

describe('splitting it line by line', () => {
  async function toSplitStep() {
    await photograph()
    await userEvent.click(await screen.findByRole('button', { name: 'Next: who had what' }))
    await screen.findByText(/Pick a name, then tap the lines/)
  }

  it('marks lines with the picked person and leaves the rest for everyone', async () => {
    const captured = renderScan()
    await toSplitStep()

    await userEvent.click(screen.getByRole('button', { name: 'Maya' }))
    await userEvent.click(screen.getByRole('button', { name: /Wine/ }))

    await waitFor(() =>
      expect(captured.previews.at(-1)).toMatchObject({
        total_amount: '54.00',
        items: [
          { name: 'Milk', user_ids: [] },
          { name: 'Wine', user_ids: [MAYA.id] },
          { name: 'Hummus', user_ids: [] },
        ],
      }),
    )
    // The unmarked lines still read as everyone's; the marked one does not.
    expect(screen.getByRole('button', { name: /Milk/ })).toHaveTextContent('Everyone')
    expect(screen.getByRole('button', { name: /Wine/ })).not.toHaveTextContent('Everyone')
    expect(screen.getByRole('button', { name: /Hummus/ })).toHaveTextContent('Everyone')
  })

  it('shows each person the amount the server worked out', async () => {
    renderScan()
    await toSplitStep()

    const perPerson = (await screen.findByText('What everyone owes')).closest('section')
    expect(perPerson).not.toBeNull()
    await waitFor(() =>
      expect(within(perPerson as HTMLElement).getByText('₪24.00')).toBeInTheDocument(),
    )
    expect(screen.getByText(/Includes a ₪6.00 discount/)).toBeInTheDocument()
  })

  it('without a picked person, a line opens a list of names instead', async () => {
    const captured = renderScan()
    await toSplitStep()

    await userEvent.click(screen.getByRole('button', { name: /Hummus/ }))
    const sheet = await screen.findByRole('dialog')
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Noa/ }))
    await userEvent.click(within(sheet).getByRole('checkbox', { name: /Gal/ }))

    await waitFor(() =>
      expect(captured.previews.at(-1)).toMatchObject({
        items: [{ user_ids: [] }, { user_ids: [] }, { user_ids: [NOA.id, GAL.id] }],
      }),
    )
  })

  it('saves an ordinary expense with its lines, then attaches the photo', async () => {
    const captured = renderScan()
    await photograph()

    // A correction on the way through, so the expense records that the
    // reading was edited.
    const amount = await screen.findByLabelText('Line 1 amount')
    await userEvent.clear(amount)
    await userEvent.type(amount, '31')
    await userEvent.tab()
    await userEvent.click(screen.getByRole('button', { name: 'Next: who had what' }))

    await userEvent.click(await screen.findByRole('button', { name: 'Gal' }))
    await userEvent.click(screen.getByRole('button', { name: /Wine/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save expense' }))

    await waitFor(() => expect(captured.attached).toEqual(['e1']))
    expect(captured.created).toHaveLength(1)
    expect(captured.created[0]).toMatchObject({
      title: 'Shufersal',
      total_amount: '54.00',
      expense_date: '2026-09-20',
      payer_id: GAL.id,
      split_type: 'EXACT',
      category: 'GROCERIES',
      source: 'OCR',
      items: [
        { name: 'Milk', amount: '31.00', user_ids: [] },
        { name: 'Wine', amount: '20.00', user_ids: [GAL.id] },
        { name: 'Hummus', amount: '10.00', user_ids: [] },
      ],
      ai_metadata: { ocr: { model: 'claude-opus-5' }, edited: true },
    })
    // The client never names participants on an itemized expense: the lines do.
    expect(captured.created[0]).not.toHaveProperty('participants')

    // And lands on the new expense.
    expect(await screen.findByRole('button', { name: 'Delete this expense' })).toBeInTheDocument()
  })

  it('keeps the expense and says so when only the photo fails', async () => {
    const captured = renderScan({ attachStatus: 500 })
    await toSplitStep()
    await userEvent.click(screen.getByRole('button', { name: 'Save expense' }))

    expect(
      await screen.findByText(/expense is saved, but the photo didn't upload/),
    ).toBeInTheDocument()
    expect(captured.created).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: 'Skip the photo' }))
    expect(await screen.findByRole('button', { name: 'Delete this expense' })).toBeInTheDocument()
  })

  it('goes back to the lines without losing what was marked', async () => {
    renderScan()
    await toSplitStep()
    await userEvent.click(screen.getByRole('button', { name: 'Maya' }))
    await userEvent.click(screen.getByRole('button', { name: /Wine/ }))

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Next: who had what' }))
    expect(await screen.findByRole('button', { name: /Wine/ })).not.toHaveTextContent('Everyone')
  })
})
