import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { applyLocale, readStoredLocale } from '@/lib/prefs'

import { I18nProvider } from './I18nProvider'
import { useT } from './i18nContext'

function Probe() {
  const t = useT()
  return <span>{t('common.actions.cancel')}</span>
}

describe('applyLocale', () => {
  it('stamps lang and dir on the document for Hebrew', () => {
    applyLocale('he')
    expect(document.documentElement.lang).toBe('he')
    expect(document.documentElement.dir).toBe('rtl')
  })

  it('stamps ltr for English', () => {
    applyLocale('en')
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.dir).toBe('ltr')
  })

  it('remembers the choice', () => {
    applyLocale('he')
    expect(readStoredLocale()).toBe('he')
  })
})

describe('useT', () => {
  it('returns Hebrew under a Hebrew provider', () => {
    render(
      <I18nProvider locale="he">
        <Probe />
      </I18nProvider>,
    )
    expect(screen.getByText('ביטול')).toBeInTheDocument()
  })

  it('returns English under an English provider', () => {
    render(
      <I18nProvider locale="en">
        <Probe />
      </I18nProvider>,
    )
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('falls back to English with no provider at all, so screen tests need no wrapper', () => {
    render(<Probe />)
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })
})
