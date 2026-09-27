import { Navigate, useNavigate } from 'react-router'

import { detailOf } from '@/api/errors'
import { Button } from '@/components/Button'
import { Spinner } from '@/components/Spinner'
import { CheckIcon, ReceiptIcon } from '@/components/icons'
import { Page, Stack } from '@/components/layout'
import { useT } from '@/i18n/i18nContext'

import { useConnectGmail, useGmailStatus } from './api'

const POINTS = [
  'bills.onboarding.point1',
  'bills.onboarding.point2',
  'bills.onboarding.point3',
  'bills.onboarding.point4',
] as const

/**
 * Offered once, straight after sign-up: bring bills in from Gmail?
 *
 * A separate step rather than part of the sign-up form, and easy to skip:
 * asking to read someone's email before they have seen the app is how an app
 * loses them. "Not now" goes home; Settings keeps the offer for later.
 *
 * Skipped without a word when this server has no Gmail set up, or when the
 * account is somehow already connected.
 */
export function ConnectGmailOnboarding() {
  const t = useT()
  const navigate = useNavigate()
  const status = useGmailStatus()
  // Back to Home after Google, not Settings: this is the first run.
  const connect = useConnectGmail('home')

  if (status.isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner size="lg" label={t('common.actions.loading')} />
      </div>
    )
  }
  if (status.isError || !status.data?.available || status.data.connected) {
    return <Navigate to="/" replace />
  }

  return (
    <Page width="narrow" padded className="flex min-h-dvh flex-col justify-center py-10">
      <Stack gap={4}>
        <ReceiptIcon className="text-accent size-12" aria-hidden="true" />
        <h1 className="font-display text-3xl font-black tracking-tight text-balance">
          {t('bills.onboarding.title')}
        </h1>
        <p className="text-muted text-base">{t('bills.onboarding.body')}</p>

        <ul className="flex flex-col gap-2.5">
          {POINTS.map((key) => (
            <li key={key} className="flex items-start gap-2.5 text-sm">
              <CheckIcon className="text-credit mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>

        {connect.isError && (
          <p role="alert" className="bg-danger-soft text-danger rounded-sm px-3 py-2.5 text-sm">
            {detailOf(connect.error)}
          </p>
        )}

        <Stack gap={2} className="pt-2">
          <Button size="lg" fullWidth loading={connect.isPending} onClick={() => connect.mutate()}>
            {t('bills.onboarding.connect')}
          </Button>
          <Button variant="ghost" fullWidth onClick={() => navigate('/', { replace: true })}>
            {t('bills.onboarding.later')}
          </Button>
          <p className="text-muted text-center text-xs">{t('bills.onboarding.laterNote')}</p>
        </Stack>
      </Stack>
    </Page>
  )
}
