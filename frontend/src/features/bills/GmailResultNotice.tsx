import { useSearchParams } from 'react-router'

import { useT } from '@/i18n/i18nContext'
import { cn } from '@/lib/cn'

/** What Google's redirect back to `?gmail=...` means, in words. */
const RESULTS = {
  connected: { key: 'bills.gmail.resultConnected', tone: 'bg-credit-soft text-credit' },
  denied: { key: 'bills.gmail.resultDenied', tone: 'bg-warn-soft text-warn' },
  failed: { key: 'bills.gmail.resultFailed', tone: 'bg-danger-soft text-danger' },
} as const

/**
 * How connecting Gmail went, on whichever screen Google sent the browser back
 * to -- Settings, or Home after the step offered at sign-up. Closing it drops
 * the query, so a refresh does not say it again.
 */
export function GmailResultNotice({ className }: { className?: string }) {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const outcome = params.get('gmail')
  const result = outcome && outcome in RESULTS ? RESULTS[outcome as keyof typeof RESULTS] : null
  if (!result) return null

  return (
    <p role="status" className={cn('rounded-sm px-3 py-2.5 text-sm', result.tone, className)}>
      {t(result.key)}{' '}
      <button
        type="button"
        className="font-display font-bold underline"
        onClick={() => setParams({}, { replace: true })}
      >
        {t('common.actions.close')}
      </button>
    </p>
  )
}
