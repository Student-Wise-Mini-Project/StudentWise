import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
  phone_number: null as string | null,
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

function renderScreen(as = GAL, { currency = 'ILS', plan = PLAN } = {}) {
  window.localStorage.setItem('sw.token', 'tok')
  server.use(
    http.get(apiUrl('/api/auth/me'), () => HttpResponse.json(as)),
    http.get(apiUrl('/api/groups/g1/balances'), () => HttpResponse.json(BALANCES)),
    http.get(apiUrl('/api/groups/g1/settlement-plan'), () => HttpResponse.json(plan)),
  )

  const scope = {
    group: GROUP,
    groupId: 'g1',
    currency,
    activeMembers: GROUP.members,
    allMembers: GROUP.members,
    me: GROUP.members.find((m) => m.user.id === as.id),
    isOwner: as.id === GAL.id,
    isOpen: true,
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
    //
    // `findAllByText`, not `findByText`: the sentence under the slab and the
    // row in "And one more" both say this now. They used to differ only because
    // the row was three JSX fragments and so matched no single text node --
    // translation made it one string, which is what a translator needs.
    renderScreen(GAL)
    expect(await screen.findAllByText(/Noa pays Maya/)).not.toHaveLength(0)
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
                isOpen: true,
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

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

/** Maya with a phone number, as the API returns it to someone in her group. */
const MAYA_WITH_PHONE = { ...MAYA, phone_number: '+972521234567' }
const PLAN_WITH_PHONE = {
  ...PLAN,
  transfers: [
    { from_user: GAL, to_user: MAYA_WITH_PHONE, amount: '1474.76' },
    { from_user: NOA, to_user: MAYA_WITH_PHONE, amount: '582.02' },
  ],
}

function onAPhone() {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE)
}

function fakeClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}

describe('paying with Bit or PayBox (7.1)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('offers to pay your own debt, and still lets you just record one', async () => {
    renderScreen(GAL)
    expect(await screen.findByRole('button', { name: 'Pay Maya' })).toBeInTheDocument()
    // Cash happens. Recording without the apps is still one tap away.
    expect(screen.getByRole('button', { name: 'Record that this happened' })).toBeInTheDocument()
  })

  it("only records other people's debts -- you cannot pay them", async () => {
    renderScreen(GAL)
    await screen.findByRole('button', { name: 'Pay Maya' })
    // Noa -> Maya is in "And one more"; it is not Gal's to pay.
    expect(screen.getByRole('button', { name: 'Record' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pay' })).not.toBeInTheDocument()
  })

  it('offers it on a row too, when the row is your debt', async () => {
    // Gal's transfer leads the slab for Gal; for Maya, who owes nobody, the
    // slab falls back to the biggest. Put Gal's debt second so it is a row.
    renderScreen(GAL, {
      plan: {
        ...PLAN,
        transfers: [
          { from_user: NOA, to_user: MAYA, amount: '582.02' },
          { from_user: GAL, to_user: NOA, amount: '20.00' },
          { from_user: GAL, to_user: MAYA, amount: '1474.76' },
        ],
      },
    })
    // The slab takes Gal's first transfer; the other one is a row with "Pay".
    expect(await screen.findByRole('button', { name: 'Pay Noa' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay' })).toBeInTheDocument()
  })

  it('never offers the apps for a group in another currency', async () => {
    // Bit and PayBox pay in shekels; the right number in euros is wrong.
    renderScreen(GAL, { currency: 'EUR' })
    await screen.findByText(/You pay Maya\./)
    expect(screen.queryByRole('button', { name: 'Pay Maya' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record that this happened' })).toBeInTheDocument()
  })

  it('shows the number and amount, and copies exactly what the other app wants', async () => {
    // After setup(): user-event installs a clipboard of its own over ours.
    const person = userEvent.setup()
    const writeText = fakeClipboard()
    renderScreen(GAL, { plan: PLAN_WITH_PHONE })
    await person.click(await screen.findByRole('button', { name: 'Pay Maya' }))

    expect(await screen.findByRole('heading', { name: 'Pay Maya' })).toBeInTheDocument()
    expect(screen.getByText('052-123-4567')).toBeInTheDocument()

    await person.click(screen.getByRole('button', { name: "Copy Maya's phone number" }))
    // Digits only, the national form: what Bit's "send to a number" takes.
    expect(writeText).toHaveBeenLastCalledWith('0521234567')
    expect(await screen.findByText('Copied')).toBeInTheDocument()

    await person.click(screen.getByRole('button', { name: 'Copy the amount' }))
    // No symbol and no grouping comma.
    expect(writeText).toHaveBeenLastCalledWith('1474.76')
  })

  it('says so when copying is impossible, instead of pretending', async () => {
    // No clipboard API: a phone on the dev server over plain http.
    const person = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    renderScreen(GAL, { plan: PLAN_WITH_PHONE })
    await person.click(await screen.findByRole('button', { name: 'Pay Maya' }))
    await person.click(await screen.findByRole('button', { name: 'Copy the amount' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't copy/)
  })

  it('says where the number goes when the payee has not added one', async () => {
    const person = userEvent.setup()
    renderScreen(GAL)
    await person.click(await screen.findByRole('button', { name: 'Pay Maya' }))
    expect(
      await screen.findByText(/Maya hasn't added a phone number yet\. It goes under You/),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: "Copy Maya's phone number" }),
    ).not.toBeInTheDocument()
  })

  it('offers no store link on a computer, where neither app runs', async () => {
    const person = userEvent.setup()
    renderScreen(GAL)
    await person.click(await screen.findByRole('button', { name: 'Pay Maya' }))
    // The test browser is a desktop one.
    expect(await screen.findByText(/run on your phone/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open Bit' })).not.toBeInTheDocument()
  })

  it('on an iPhone, links each app to its App Store page, where "Open" launches it', async () => {
    onAPhone()
    const person = userEvent.setup()
    renderScreen(GAL)
    await person.click(await screen.findByRole('button', { name: 'Pay Maya' }))
    expect(await screen.findByRole('link', { name: 'Open Bit' })).toHaveAttribute(
      'href',
      'https://apps.apple.com/il/app/id1182007739',
    )
    expect(screen.getByRole('link', { name: 'Open PayBox' })).toHaveAttribute(
      'href',
      'https://apps.apple.com/il/app/id895491053',
    )
  })

  it('"I paid" goes straight to recording it, with the app you opened chosen', async () => {
    onAPhone()
    let posted: unknown
    server.use(
      http.post(apiUrl('/api/groups/g1/settlements'), async ({ request }) => {
        posted = await request.json()
        return HttpResponse.json({}, { status: 201 })
      }),
    )
    const person = userEvent.setup()
    renderScreen(GAL)
    await person.click(await screen.findByRole('button', { name: 'Pay Maya' }))
    const paybox = await screen.findByRole('link', { name: 'Open PayBox' })
    // The store opens in a new tab; here, only the click matters.
    paybox.addEventListener('click', (event) => event.preventDefault())
    await person.click(paybox)
    await person.click(screen.getByRole('button', { name: 'I paid Maya' }))

    expect(await screen.findByRole('heading', { name: 'Record a payment' })).toBeInTheDocument()
    expect(screen.getByLabelText(/How\?/)).toHaveValue('PAYBOX')
    expect(screen.getByLabelText(/How much/)).toHaveValue('1474.76')

    await person.click(screen.getByRole('button', { name: 'Record it' }))
    await vi.waitFor(() => expect(posted).toBeDefined())
    expect(posted).toMatchObject({
      from_user_id: GAL.id,
      to_user_id: MAYA.id,
      amount: '1474.76',
      method: 'PAYBOX',
    })
  })

  it('defaults to Bit when no app was opened from here', async () => {
    const person = userEvent.setup()
    renderScreen(GAL)
    await person.click(await screen.findByRole('button', { name: 'Pay Maya' }))
    await person.click(await screen.findByRole('button', { name: 'I paid Maya' }))
    expect(await screen.findByLabelText(/How\?/)).toHaveValue('BIT')
  })

  it('records a plain payment as cash, as it always did', async () => {
    const person = userEvent.setup()
    renderScreen(GAL)
    await person.click(await screen.findByRole('button', { name: 'Record that this happened' }))
    expect(await screen.findByLabelText(/How\?/)).toHaveValue('MANUAL')
  })
})
