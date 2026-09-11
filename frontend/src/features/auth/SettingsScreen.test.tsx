import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/api/queryClient'
import { I18nProvider } from '@/i18n/I18nProvider'

import { AuthProvider } from './AuthProvider'
import { SettingsScreen } from './SettingsScreen'

/**
 * No token is stored, so `AuthProvider` resolves immediately and fetches
 * nothing -- the language control is the subject here, not the session.
 */
function renderSettings() {
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
