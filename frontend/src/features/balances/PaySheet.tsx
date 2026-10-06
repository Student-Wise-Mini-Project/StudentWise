import type { PlannedTransfer } from '@/api/types'
import { Button, ExternalLinkButton } from '@/components/Button'
import { CopyButton } from '@/components/CopyButton'
import { Money } from '@/components/Money'
import { Sheet } from '@/components/Sheet'
import { Stack } from '@/components/layout'
import { useT } from '@/i18n/i18nContext'
import { settlementMethodLabel } from '@/lib/labels'
import { PAY_APPS, type PayApp, payAppLink } from '@/lib/payApps'
import { formatPhone } from '@/lib/phone'

/**
 * Paying a planned transfer with Bit or PayBox (7.1).
 *
 * Everything the other app needs, each with a copy button, then a way into the
 * app, then "I paid" -- which hands over to the record sheet with the app
 * already chosen. Nothing here moves a balance: only a recorded payment does,
 * and only the person can say the money actually left.
 *
 * Only offered for your own debts in a shekel group; see `canPayWithApps`.
 */
export function PaySheet({
  transfer,
  currency,
  onClose,
  onPaid,
  onOpenApp,
}: {
  transfer: PlannedTransfer | null
  currency: string
  onClose: () => void
  onPaid: (transfer: PlannedTransfer) => void
  onOpenApp: (app: PayApp) => void
}) {
  const t = useT()
  const payee = transfer?.to_user
  const name = payee?.name ?? ''
  const phone = payee?.phone_number ?? null
  const links = PAY_APPS.map((app) => ({ app, href: payAppLink(app) }))
  const onPhone = links.some((link) => link.href !== null)

  return (
    <Sheet
      open={transfer !== null}
      onClose={onClose}
      title={t('balances.pay.title', { name })}
      description={t('balances.pay.description')}
      footer={
        <>
          <Button variant="secondary" fullWidth onClick={onClose}>
            {t('common.actions.cancel')}
          </Button>
          <Button fullWidth onClick={() => transfer && onPaid(transfer)}>
            {t('balances.pay.paid', { name })}
          </Button>
        </>
      }
    >
      {transfer && (
        <Stack gap={4}>
          <div className="bg-sunken divide-line divide-y rounded-lg">
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-muted text-xs font-semibold">
                  {t('balances.pay.phone', { name })}
                </p>
                {phone ? (
                  // A phone number reads the same way in any language; without
                  // the isolate, Hebrew moves its dashes to the wrong end.
                  <p className="font-display text-lg font-extrabold select-all">
                    <bdi dir="ltr">{formatPhone(phone)}</bdi>
                  </p>
                ) : (
                  <p className="text-muted mt-0.5 text-sm">{t('balances.pay.noPhone', { name })}</p>
                )}
              </div>
              {phone && (
                <CopyButton
                  // Digits only: what Bit's "send to a number" field takes.
                  value={formatPhone(phone).replace(/-/g, '')}
                  label={t('balances.pay.copyPhone', { name })}
                />
              )}
            </div>

            <div className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-muted text-xs font-semibold">{t('balances.pay.amount')}</p>
                <span className="select-all">
                  <Money amount={transfer.amount} currency={currency} size="lg" />
                </span>
              </div>
              {/* The plain decimal, as the API sent it -- no symbol, no
               * grouping comma for the other app to choke on. */}
              <CopyButton value={transfer.amount} label={t('balances.pay.copyAmount')} />
            </div>
          </div>

          {onPhone ? (
            <div>
              <div className="grid grid-cols-2 gap-2">
                {links.map(
                  ({ app, href }) =>
                    href && (
                      <ExternalLinkButton
                        key={app}
                        href={href}
                        onClick={() => onOpenApp(app)}
                        variant="secondary"
                        fullWidth
                      >
                        {t('balances.pay.open', { app: settlementMethodLabel(t, app) })}
                      </ExternalLinkButton>
                    ),
                )}
              </div>
              <p className="text-muted mt-2 text-xs">{t('balances.pay.storeNote')}</p>
            </div>
          ) : (
            <p className="text-muted text-sm">{t('balances.pay.desktopNote')}</p>
          )}
        </Stack>
      )}
    </Sheet>
  )
}
