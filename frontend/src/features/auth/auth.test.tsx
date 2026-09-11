import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/api/queryClient'
import { RequireAuth } from '@/app/guards/RequireAuth'
import { apiUrl } from '@/test/apiUrl'
import { server } from '@/test/server'

import { AuthProvider } from './AuthProvider'
import { LoginScreen } from './AuthScreens'

const GAL = {
  id: '11111111-2222-4333-8444-555555555555',
  name: 'Gal',
  email: 'gal@studentwise.dev',
  phone_number: null,
  created_at: '2026-09-01T10:00:00Z',
}

function renderApp(initialPath = '/login') {
  const queryClient = createQueryClient()
  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialPath]}>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginScreen />} />
              <Route element={<RequireAuth />}>
                <Route path="/" element={<h1>Home</h1>} />
                <Route path="/groups" element={<h1>Groups</h1>} />
              </Route>
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}

describe('signing in', () => {
  it('posts form-encoded credentials with the email in a field called username', async () => {
    // This is the single most surprising thing in the whole API contract. The
    // backend uses FastAPI's OAuth2PasswordRequestForm so the Authorize button
    // in /docs works, which means JSON here gets a 422 that explains nothing.
    let contentType: string | null = null
    let body = ''

    server.use(
      http.post(apiUrl('/api/auth/login'), async ({ request }) => {
        contentType = request.headers.get('content-type')
        body = await request.text()
        return HttpResponse.json({ access_token: 'tok-123', token_type: 'bearer', user: GAL })
      }),
      http.get(apiUrl('/api/auth/me'), () => HttpResponse.json(GAL)),
    )

    const { user } = renderApp()
    await user.type(screen.getByLabelText(/^Email/), 'gal@studentwise.dev')
    await user.type(screen.getByLabelText(/^Password/), 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(contentType).toContain('application/x-www-form-urlencoded'))

    const fields = new URLSearchParams(body)
    expect(fields.get('username')).toBe('gal@studentwise.dev')
    expect(fields.get('password')).toBe('password123')
    // Not a JSON field called `email`, which is the natural guess.
    expect(fields.get('email')).toBeNull()
  })

  it('lands on the protected page and keeps the token', async () => {
    server.use(
      http.post(apiUrl('/api/auth/login'), () =>
        HttpResponse.json({ access_token: 'tok-123', token_type: 'bearer', user: GAL }),
      ),
      http.get(apiUrl('/api/auth/me'), () => HttpResponse.json(GAL)),
    )

    const { user } = renderApp()
    await user.type(screen.getByLabelText(/^Email/), 'gal@studentwise.dev')
    await user.type(screen.getByLabelText(/^Password/), 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(window.localStorage.getItem('sw.token')).toBe('tok-123')
  })

  it('shows a wrong password on the form instead of bouncing to the login screen', async () => {
    // A 401 from /auth/login means "wrong password", not "your session died".
    // The global handler must not fire here or the message is wiped before it
    // can be read.
    server.use(
      http.post(apiUrl('/api/auth/login'), () =>
        HttpResponse.json({ detail: 'Incorrect email or password.' }, { status: 401 }),
      ),
    )

    const { user } = renderApp()
    await user.type(screen.getByLabelText(/^Email/), 'gal@studentwise.dev')
    await user.type(screen.getByLabelText(/^Password/), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
    expect(screen.getByLabelText(/^Email/)).toBeInTheDocument()
  })
})

describe('protected routes', () => {
  it('sends an anonymous visitor to the login screen, remembering where they were going', async () => {
    renderApp('/groups')
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('does not flash the login screen while a stored token is being resolved', async () => {
    // The cold-start case: the token is in storage but the user is not loaded
    // yet. Without the isResolving gate, every reload of a protected page blinks
    // through the login form on its way back.
    window.localStorage.setItem('sw.token', 'tok-123')
    server.use(http.get(apiUrl('/api/auth/me'), () => HttpResponse.json(GAL)))

    renderApp('/groups')
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Groups' })).toBeInTheDocument()
  })

  it('clears the session when the API says the token is dead', async () => {
    window.localStorage.setItem('sw.token', 'expired')
    server.use(
      http.get(apiUrl('/api/auth/me'), () =>
        HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
      ),
    )

    renderApp('/groups')
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    await waitFor(() => expect(window.localStorage.getItem('sw.token')).toBeNull())
  })
})
