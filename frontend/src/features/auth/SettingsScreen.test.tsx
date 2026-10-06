import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/api/queryClient'
import { I18nProvider } from '@/i18n/I18nProvider'
import { apiUrl } from '@/test/apiUrl'
import { server } from '@/test/server'

import { AuthProvider } from './AuthProvider'
import { SettingsScreen } from './SettingsScreen'

/**
 * No token is stored, so `AuthProvider` resolves immediately and fetches
 * nothing -- the language control is the subject here, not the session.
 */
function renderSettings() {
  // The Gmail section asks whether Gmail is connected.
  server.use(
    http.get(apiUrl('/api/integrations/gmail'), () =>
      HttpResponse.json({ available: false, connected: false, needs_reconnect: false }),
    ),
  )
  return render(
    <I18nProvider locale="en">
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter>
          <AuthProvider>
            <SettingsScreen />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nProvider>,
  )
}

describe('the language switch', () => {
  it('switches the app to Hebrew and flips the document', async () => {
    renderSettings()
    expect(screen.getByText('Language')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: 'עברית' }))

    expect(document.documentElement.dir).toBe('rtl')
    expect(document.documentElement.lang).toBe('he')
    expect(screen.getByText('שפה')).toBeInTheDocument()
  })

  it('names each language in its own language, in either direction', () => {
    renderSettings()
    // The one place an untranslated string is correct: a picker that said
    // "Hebrew" in Hebrew would be unreadable to the person looking for it.
    expect(screen.getByRole('radio', { name: 'עברית' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'English' })).toBeInTheDocument()
  })
})

const GAL = {
  id: 'u-gal',
  name: 'Gal',
  email: 'gal@studentwise.dev',
  phone_number: null as string | null,
  created_at: '2026-01-01T00:00:00Z',
}

/** Signed in as Gal, recording every PATCH of the profile. */
function renderSignedIn(phone: string | null = null) {
  window.localStorage.setItem('sw.token', 'tok')
  const sent: unknown[] = []
  server.use(
    http.get(apiUrl('/api/auth/me'), () => HttpResponse.json({ ...GAL, phone_number: phone })),
    http.patch(apiUrl('/api/users/me'), async ({ request }) => {
      const body = (await request.json()) as { phone_number: string | null }
      sent.push(body)
      // What the server does: store it normalised.
      const stored = body.phone_number === null ? null : '+972521234567'
      return HttpResponse.json({ ...GAL, phone_number: stored })
    }),
  )
  renderSettings()
  return sent
}

describe('your phone number (7.3)', () => {
  it('saves a number and shows it the way Israelis write it', async () => {
    const sent = renderSignedIn()
    const person = userEvent.setup()
    const field = await screen.findByLabelText('Phone number')
    expect(screen.getByText(/Only people in your groups can see it/)).toBeInTheDocument()

    await person.type(field, '+972 52 123 4567')
    await person.click(screen.getByRole('button', { name: 'Save number' }))

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    // Sent as typed; the server is what normalises it.
    expect(sent).toEqual([{ phone_number: '+972 52 123 4567' }])
    expect(field).toHaveValue('052-123-4567')
  })

  it('says what is wrong, in words, before asking the server', async () => {
    const sent = renderSignedIn()
    const person = userEvent.setup()
    const field = await screen.findByLabelText('Phone number')

    await person.type(field, '03-1234567')
    await person.click(screen.getByRole('button', { name: 'Save number' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bit and PayBox need a mobile number (05X).',
    )
    expect(sent).toEqual([])
  })

  it('removes a number', async () => {
    const sent = renderSignedIn('+972521234567')
    const person = userEvent.setup()
    // The field follows the account once it has loaded.
    expect(await screen.findByDisplayValue('052-123-4567')).toBeInTheDocument()

    await person.click(screen.getByRole('button', { name: 'Remove number' }))

    expect(await screen.findByText('Removed.')).toBeInTheDocument()
    expect(sent).toEqual([{ phone_number: null }])
    expect(screen.getByLabelText('Phone number')).toHaveValue('')
  })

  it('has nothing to save until the number changes', async () => {
    renderSignedIn('+972521234567')
    expect(await screen.findByDisplayValue('052-123-4567')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save number' })).toBeDisabled()
  })

  it('does not let Hebrew reverse a phone number', async () => {
    renderSignedIn('+972521234567')
    expect(await screen.findByLabelText('Phone number')).toHaveAttribute('dir', 'ltr')
  })
})
