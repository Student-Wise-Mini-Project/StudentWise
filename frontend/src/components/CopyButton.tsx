import { useEffect, useState } from 'react'

import { useT } from '@/i18n/i18nContext'

import { Button } from './Button'

/**
 * Copies one value and says so.
 *
 * The clipboard API exists only in a secure context, which a phone testing the
 * dev server over plain http on the LAN is not. There it says copying failed
 * and how to do it by hand, rather than pretending -- the value is always on
 * screen and selectable, so nothing is lost.
 */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useT()
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    if (state !== 'copied') return
    const timer = window.setTimeout(() => setState('idle'), 2000)
    return () => window.clearTimeout(timer)
  }, [state])

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('no clipboard')
      await navigator.clipboard.writeText(value)
      setState('copied')
    } catch {
      setState('failed')
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button size="sm" variant="secondary" aria-label={label} onClick={() => void copy()}>
        {state === 'copied' ? t('common.state.copied') : t('common.actions.copy')}
      </Button>
      {state === 'failed' && (
        <span role="alert" className="text-danger text-2xs font-medium">
          {t('common.state.copyFailed')}
        </span>
      )}
    </span>
  )
}
