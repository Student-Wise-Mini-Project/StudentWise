import { useEffect, useState } from 'react'
import { useT } from '@/i18n/i18nContext'

/**
 * "You are offline."
 *
 * Worth saying out loud, because the app keeps working when it happens: cached
 * groups, expenses and balances are still there. Without this line, data that is
 * quietly a few minutes old looks like data that is current.
 */
export function OfflineBanner() {
  const t = useT()
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  if (online) return null

  return (
    <p
      role="status"
      className="bg-warn-soft text-warn sticky top-0 z-40 px-4 py-1.5 text-center text-xs font-semibold"
    >
      {t('common.offline')}
    </p>
  )
}
