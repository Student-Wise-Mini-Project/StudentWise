import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/api/queryClient'
import type { Group } from '@/api/types'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { RegisterScreen } from '@/features/auth/AuthScreens'
import { GroupContext } from '@/features/groups/groupContext'
import { safeNext } from '@/lib/invite'
import { apiUrl } from '@/test/apiUrl'
import { server } from '@/test/server'

import { GroupListScreen } from './GroupListScreen'
import { JoinScreen } from './JoinScreen'
import { MembersScreen } from './MembersScreen'

/**
 * Inviting people who are not in the app yet: an email that finds nobody turns
 * into an invite link, a link is shared on WhatsApp or by email, and opening it
 * joins the group -- through sign-up if need be.
 */

const person = (id: string, name: string) => ({
  id,
  name,
  email: `${name.toLowerCase()}@studentwise.dev`,
  phone_number: null,
  created_at: '2026-01-01T00:00:00Z',
})
const GAL = person('u-gal', 'Gal')

const GROUP = {
  id: 'g1',
  name: 'Dizengoff 5',
  type: 'SHARED_APARTMENT',
  currency: 'ILS',
  created_by: GAL.id,
  created_at: '2026-01-01T00:00:00Z',
  archived_at: null,
  members: [
    {
      user: GAL,
      role: 'OWNER',
      default_split_weight: '1',
      joined_at: '2026-01-01T00:00:00Z',
      left_at: null,
    },
  ],
} as unknown as Group

const INVITE = { group_id: 'g1', token: 'tok-abc', expires_at: '2026-10-20T10:00:00Z' }

function Where() {
  const location = useLocation()
  return <span data-testid="where">{`${location.pathname}${location.search}`}</span>
}

function withApp(ui: React.ReactNode, path = '/') {
  window.localStorage.setItem('sw.token', 'tok')
  server.use(http.get(apiUrl('/api/auth/me'), () => HttpResponse.json(GAL)))
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          {ui}
          <Where />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function inGroup(ui: React.ReactNode, path = '/') {
  server.use(
    http.get(apiUrl('/api/groups/g1/balances'), () =>
      HttpResponse.json({ group_id: 'g1', currency: 'ILS', balances: [] }),
    ),
    http.get(apiUrl('/api/groups/g1/settlement-plan'), () =>
      HttpResponse.json({ group_id: 'g1', currency: 'ILS', transfers: [] }),
    ),
  )
  return withApp(
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
      {ui}
    </GroupContext>,
    path,
  )
}

function sharing() {
  const bodies: unknown[] = []
  let token = INVITE.token
  server.use(
    http.post(apiUrl('/api/groups/g1/invites'), async ({ request }) => {
      const body = (await request.json()) as { renew?: boolean }
      bodies.push(body)
      if (body.renew) token = 'tok-new'
      return HttpResponse.json({ ...INVITE, token })
    }),
  )
  return bodies
}

// --- sharing a link ---------------------------------------------------------------

describe('the invite link', () => {
  it('can be shared on WhatsApp or by email, and replaced', async () => {
    const bodies = sharing()
    inGroup(<MembersScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Invite with a link' }))

    const sheet = await screen.findByRole('dialog')
    const link = `${window.location.origin}/join/tok-abc`
    expect(await within(sheet).findByDisplayValue(link)).toBeInTheDocument()

    const whatsapp = within(sheet).getByRole('link', { name: 'WhatsApp' })
    expect(whatsapp.getAttribute('href')).toBe(
      `https://wa.me/?text=${encodeURIComponent(
        `Join Dizengoff 5 on StudentWise, so we can split our expenses: ${link}`,
      )}`,
    )
    expect(within(sheet).getByRole('link', { name: 'Email' }).getAttribute('href')).toMatch(
      /^mailto:\?subject=Join%20Dizengoff%205/,
    )

    await userEvent.click(within(sheet).getByRole('button', { name: 'Make a new link' }))
    expect(
      await within(sheet).findByDisplayValue(`${window.location.origin}/join/tok-new`),
    ).toBeInTheDocument()
    expect(bodies).toEqual([{ renew: false }, { renew: true }])
  })

  it('is offered when an email finds nobody, addressed to that email', async () => {
    sharing()
    server.use(
      http.post(apiUrl('/api/groups/g1/members'), () =>
        HttpResponse.json({ detail: 'User not found' }, { status: 404 }),
      ),
    )
    inGroup(<MembersScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add someone' }))
    await userEvent.type(await screen.findByLabelText(/Their email/), 'new.flatmate@gmail.com')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "new.flatmate@gmail.com doesn't have a StudentWise account yet",
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Invite new.flatmate@gmail.com with a link' }),
    )
    const sheet = await screen.findByRole('dialog', { name: /Invite to Dizengoff 5/ })
    expect(
      (await within(sheet).findByRole('link', { name: 'Email' })).getAttribute('href'),
    ).toMatch(/^mailto:new\.flatmate@gmail\.com\?/)
  })
})

// --- creating a group with emails -----------------------------------------------------

describe('creating a group with emails', () => {
  it('adds who has an account, and invites who does not', async () => {
    const added: unknown[] = []
    server.use(
      http.get(apiUrl('/api/groups'), () => HttpResponse.json([])),
      http.post(apiUrl('/api/groups'), () =>
        HttpResponse.json({ ...GROUP, id: 'g9', name: 'New flat' }, { status: 201 }),
      ),
      http.post(apiUrl('/api/groups/g9/members'), async ({ request }) => {
        const body = (await request.json()) as { email: string }
        added.push(body.email)
        return body.email === 'maya@studentwise.dev'
          ? HttpResponse.json({}, { status: 201 })
          : HttpResponse.json({ detail: 'User not found' }, { status: 404 })
      }),
    )
    withApp(
      <Routes>
        <Route path="/groups" element={<GroupListScreen />} />
        <Route path="/groups/:groupId/members" element={<span>members</span>} />
      </Routes>,
      '/groups',
    )
    await userEvent.click(await screen.findByRole('button', { name: 'New' }))
    const sheet = await screen.findByRole('dialog')
    await userEvent.type(within(sheet).getByLabelText(/^Name/), 'New flat')
    for (const email of ['Maya@StudentWise.dev', 'new@gmail.com']) {
      await userEvent.type(within(sheet).getByLabelText(/Add by email/), email)
      await userEvent.click(within(sheet).getByRole('button', { name: 'Add' }))
    }
    await userEvent.click(within(sheet).getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/groups/g9/members'))
    expect(added).toEqual(['maya@studentwise.dev', 'new@gmail.com'])
  })
})

// --- opening a link ----------------------------------------------------------------------

function joining(preview: object, status = 200) {
  const accepted: string[] = []
  server.use(
    http.get(apiUrl('/api/invites/tok-abc'), () => HttpResponse.json(preview, { status })),
    http.post(apiUrl('/api/invites/tok-abc/accept'), () => {
      accepted.push('tok-abc')
      return HttpResponse.json({ group_id: 'g1' })
    }),
  )
  withApp(
    <Routes>
      <Route path="/join/:token" element={<JoinScreen />} />
      <Route path="/groups/:groupId" element={<span>the group</span>} />
    </Routes>,
    '/join/tok-abc',
  )
  return accepted
}

const PREVIEW = {
  group_id: 'g1',
  group_name: 'Dizengoff 5',
  group_type: 'SHARED_APARTMENT',
  invited_by: 'Maya',
  expires_at: '2026-10-20T10:00:00Z',
  already_member: false,
  is_open: true,
}

describe('opening an invite link', () => {
  it('shows the group and who invited, and joins on one tap', async () => {
    const accepted = joining(PREVIEW)
    expect(await screen.findByText('Invited by Maya')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Join Dizengoff 5' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/groups/g1'))
    expect(accepted).toEqual(['tok-abc'])
  })

  it('says when the link is no longer valid', async () => {
    joining({ detail: 'This invite link is no longer valid.' }, 404)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This invite link is no longer valid. Ask for a new one.',
    )
  })

  it('takes a member straight to the group', async () => {
    joining({ ...PREVIEW, already_member: true })
    expect(await screen.findByText("You're already in this group.")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the group' })).toHaveAttribute(
      'href',
      '/groups/g1',
    )
  })

  it('offers no Join for a closed group', async () => {
    joining({ ...PREVIEW, is_open: false })
    expect(await screen.findByText(/isn't taking new members/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Join/ })).not.toBeInTheDocument()
  })
})

// --- signing up from a link ------------------------------------------------------------------

describe('signing up from an invite link', () => {
  it('returns to the link instead of the Gmail offer', async () => {
    window.localStorage.removeItem('sw.token')
    server.use(
      http.post(apiUrl('/api/auth/register'), () =>
        HttpResponse.json(
          { access_token: 'tok', token_type: 'bearer', user: GAL },
          { status: 201 },
        ),
      ),
      http.get(apiUrl('/api/auth/me'), () => HttpResponse.json(GAL)),
    )
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={['/register?next=%2Fjoin%2Ftok-abc']}>
          <AuthProvider>
            <Routes>
              <Route path="/register" element={<RegisterScreen />} />
              <Route path="/join/:token" element={<span>join page</span>} />
              <Route path="/welcome/gmail" element={<span>gmail offer</span>} />
            </Routes>
            <Where />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await userEvent.type(screen.getByLabelText(/Name/), 'Noa')
    await userEvent.type(screen.getByLabelText(/Email/), 'noa@example.com')
    await userEvent.type(screen.getByLabelText(/Password/), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /Create account|Sign up/ }))
    expect(await screen.findByText('join page')).toBeInTheDocument()
  })

  it('only ever returns somewhere inside the app', () => {
    expect(safeNext('/join/abc')).toBe('/join/abc')
    expect(safeNext('https://evil.example')).toBeNull()
    expect(safeNext('//evil.example')).toBeNull()
    expect(safeNext('/\\evil.example')).toBeNull()
    expect(safeNext(null)).toBeNull()
  })
})
