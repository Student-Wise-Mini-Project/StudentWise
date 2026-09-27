import { Link, useSearchParams } from 'react-router'

import { detailOf } from '@/api/errors'
import { Button } from '@/components/Button'
import { ListSection } from '@/components/ListRow'
import { Spinner } from '@/components/Spinner'
import { useT } from '@/i18n/i18nContext'
import { formatRelative } from '@/lib/dates'

import {
  useConnectGmail,
  useDisconnectGmail,
  useGmailStatus,
  usePendingBills,
  useSyncGmail,
} from './api'

/** What Google's redirect back to `/settings?gmail=...` means, in words. */
const RESULTS = {
  connected: { key: 'bills.gmail.resultConnected', tone: 'bg-credit-soft text-credit' },
  denied: { key: 'bills.gmail.resultDenied', tone: 'bg-warn-soft text-warn' },
  failed: { key: 'bills.gmail.resultFailed', tone: 'bg-danger-soft text-danger' },
} as const

export function GmailSection() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const status = useGmailStatus()
  const connect = useConnectGmail()
  const disconnect = useDisconnectGmail()
  const sync = useSyncGmail()
  const connected = status.data?.connected === true
  const pending = usePendingBills(connected)

  const outcome = params.get('gmail')
  const result = outcome && outcome in RESULTS ? RESULTS[outcome as keyof typeof RESULTS] : null
  const error = connect.error ?? disconnect.error ?? sync.error
  const pendingCount = pending.data?.total ?? 0

  return (
    <ListSection header={t('bills.gmail.header')}>
      <div className="flex flex-col gap-3 px-4 py-4">
        {result && (
          <p role="status" className={`rounded-sm px-3 py-2.5 text-sm ${result.tone}`}>
            {t(result.key)}{' '}
            <button
              type="button"
              className="font-display font-bold underline"
              onClick={() => setParams({}, { replace: true })}
            >
              {t('common.actions.close')}
            </button>
          </p>
        )}

        {status.isLoading && <Spinner label={t('common.actions.loading')} />}

        {status.data && !status.data.available && !connected && (
          <p className="text-muted text-sm">{t('bills.gmail.unavailable')}</p>
        )}

        {status.data?.available && !connected && (
          <>
            <p className="text-muted text-sm">{t('bills.gmail.intro')}</p>
            <Button loading={connect.isPending} onClick={() => connect.mutate()}>
              {t('bills.gmail.connect')}
            </Button>
          </>
        )}

        {connected && status.data && (
          <>
            <div>
              <p className="text-base font-semibold">
                {t('bills.gmail.connectedAs', { email: `⁨${status.data.google_email}⁩` })}
              </p>
              <p className="text-muted text-xs">
                {status.data.last_synced_at
                  ? t('bills.gmail.lastChecked', {
                      when: formatRelative(status.data.last_synced_at),
                    })
                  : t('bills.gmail.neverChecked')}
              </p>
            </div>

            {status.data.needs_reconnect ? (
              <>
                <p className="bg-warn-soft text-warn rounded-sm px-3 py-2.5 text-sm">
                  {t('bills.gmail.reconnectNote')}
                </p>
                <Button loading={connect.isPending} onClick={() => connect.mutate()}>
                  {t('bills.gmail.reconnect')}
                </Button>
              </>
            ) : (
              <Button variant="secondary" loading={sync.isPending} onClick={() => sync.mutate()}>
                {t('bills.gmail.checkNow')}
              </Button>
            )}

            {sync.data && (
              <p role="status" className="text-muted text-sm">
                {sync.data.checked === 0
                  ? t('bills.gmail.nothingNew')
                  : t('bills.gmail.checked', {
                      checked: sync.data.checked,
                      imported: sync.data.imported,
                      needs_review: sync.data.needs_review,
                    })}
              </p>
            )}

            <Link
              to="/bills"
              className="text-accent font-display flex items-center justify-between text-sm font-bold"
            >
              <span>{t('bills.gmail.review')}</span>
              {pendingCount > 0 && <span className="tnum">{pendingCount}</span>}
            </Link>

            <Button
              variant="ghost"
              size="sm"
              loading={disconnect.isPending}
              onClick={() => disconnect.mutate()}
              className="self-start"
            >
              {t('bills.gmail.disconnect')}
            </Button>
          </>
        )}

        {Boolean(error) && (
          <p role="alert" className="text-danger text-sm">
            {detailOf(error)}
          </p>
        )}
      </div>
    </ListSection>
  )
}
