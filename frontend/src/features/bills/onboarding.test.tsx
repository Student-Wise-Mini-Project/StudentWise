import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/api/queryClient'
import { RedirectIfAuthed, RequireAuth } from '@/app/guards/RequireAuth'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { RegisterScreen } from '@/features/auth/AuthScreens'
import { apiUrl } from '@/test/apiUrl'
import { server } from '@/test/server'

import { ConnectGmailOnboarding } from './ConnectGmailOnboarding'
import { GmailResultNotice } from './GmailResultNotice'

/**
 * The offer to connect Gmail, made once right after sign-up.
 *
 * Rendered with the real guards around the real sign-up screen: the moment
 * sign-up succeeds, `RedirectIfAuthed` wants to send the new user home, and
 * the offer must still win that race.
 */

const DANA = {
  id: '22222222-3333-4444-8555-666666666666',
  name: 'Dana',
  email: 'dana@studentwise.dev',
  phone_number: null,
  created_at: '2026-09-27T10:00:00Z',
}

function gmailStatus(body: object) {
  server.use(http.get(apiUrl('/api/integrations/gmail'), () => HttpResponse.json(body)))
}

function renderSignUp() {
  server.use(
    http.post(apiUrl('/api/auth/register'), () =>
      HttpResponse.json(
        { access_token: 'new-token', token_type: 'bearer', user: DANA },
        {
          status: 201,
        },
      ),
    ),
    http.get(apiUrl('/api/auth/me'), () => HttpResponse.json(DANA)),
  )
  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={['/register']}>
          <AuthProvider>
            <Routes>
              <Route element={<RedirectIfAuthed />}>
                <Route path="/register" element={<RegisterScreen />} />
              </Route>
              <Route element={<RequireAuth />}>
                <Route path="/welcome/gmail" element={<ConnectGmailOnboarding />} />
                <Route
                  path="/"
                  element={
                    <>
                      <h1>Home</h1>
                      <GmailResultNotice />
                    </>
                  }
                />
              </Route>
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}

async function signUp(user: ReturnType<typeof userEvent.setup>) {
  // The guard renders nothing while it checks for a stored session.
  await user.type(await screen.findByLabelText(/^Name/), 'Dana')
  await user.type(screen.getByLabelText(/^Email/), 'dana@studentwise.dev')
  await user.type(screen.getByLabelText(/^Password/), 'password123')
  await user.click(screen.getByRole('button', { name: 'Create account' }))
}

describe('right after sign-up', () => {
  const assign = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('location', { ...window.location, assign })
    assign.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('offers to bring bills in from Gmail', async () => {
    gmailStatus({ available: true, connected: false, needs_reconnect: false })
    const { user } = renderSignUp()
    await signUp(user)

    expect(
      await screen.findByRole('heading', { name: 'Bring your bills in from Gmail?' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Read-only access/)).toBeInTheDocument()
  })

  it('connecting goes to Google and asks to come back home, not to settings', async () => {
    gmailStatus({ available: true, connected: false, needs_reconnect: false })
    let returnTo: string | null = null
    server.use(
      http.post(apiUrl('/api/integrations/gmail/connect'), ({ request }) => {
        returnTo = new URL(request.url).searchParams.get('return_to')
        return HttpResponse.json({ authorization_url: 'https://accounts.google.test/consent' })
      }),
    )
    const { user } = renderSignUp()
    await signUp(user)
    await user.click(await screen.findByRole('button', { name: 'Connect Gmail' }))

    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://accounts.google.test/consent'))
    expect(returnTo).toBe('home')
  })

  it('"Not now" goes straight into the app', async () => {
    gmailStatus({ available: true, connected: false, needs_reconnect: false })
    const { user } = renderSignUp()
    await signUp(user)
    await user.click(await screen.findByRole('button', { name: 'Not now' }))
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
  })

  it('is skipped entirely when this server has no Gmail set up', async () => {
    gmailStatus({ available: false, connected: false, needs_reconnect: false })
    const { user } = renderSignUp()
    await signUp(user)
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(screen.queryByText('Bring your bills in from Gmail?')).not.toBeInTheDocument()
  })
})

describe('coming back from Google to home', () => {
  it('says it worked', async () => {
    window.localStorage.setItem('sw.token', 'tok')
    server.use(http.get(apiUrl('/api/auth/me'), () => HttpResponse.json(DANA)))
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={['/?gmail=connected']}>
          <AuthProvider>
            <Routes>
              <Route element={<RequireAuth />}>
                <Route path="/" element={<GmailResultNotice />} />
              </Route>
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText(/Gmail is connected/)).toBeInTheDocument()
  })
})
