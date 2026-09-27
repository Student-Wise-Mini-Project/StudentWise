import { Link } from 'react-router'

import { ChevronEnd } from '@/components/icons'
import { useT } from '@/i18n/i18nContext'

import { usePendingBills, useSyncGmailOnce } from './api'

/**
 * On the home screen: fetch new bills once per session, then say if any are
 * waiting. Renders nothing at all for someone who never connected Gmail.
 */
export function PendingBillsBanner() {
  const t = useT()
  const { status } = useSyncGmailOnce()
  const connected = status.data?.connected === true
  const pending = usePendingBills(connected)
  const count = pending.data?.total ?? 0

  if (connected && status.data?.needs_reconnect) {
    return (
      <Link
        to="/settings"
        className="bg-warn-soft text-warn mx-4 mt-4 flex items-center justify-between gap-3 rounded-sm px-3 py-2.5 text-sm font-semibold"
      >
        <span>{t('bills.banner.reconnect')}</span>
        <ChevronEnd className="size-5 shrink-0" />
      </Link>
    )
  }

  if (count === 0) return null

  return (
    <Link
      to="/bills"
      className="bg-accent-soft text-accent mx-4 mt-4 flex items-center justify-between gap-3 rounded-sm px-3 py-2.5 text-sm font-semibold"
    >
      <span>{t('bills.banner.pending', { count })}</span>
      <ChevronEnd className="size-5 shrink-0" />
    </Link>
  )
}
