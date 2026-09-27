import { useState } from 'react'

import { detailOf } from '@/api/errors'
import type { Group, IngestedBill } from '@/api/types'
import { AppBar } from '@/app/layouts/AppBar'
import { Button } from '@/components/Button'
import { Money } from '@/components/Money'
import { MoneyInput } from '@/components/MoneyInput'
import { Spinner } from '@/components/Spinner'
import { EmptyState, ErrorState } from '@/components/feedback'
import { Page, Stack } from '@/components/layout'
import { useGroups } from '@/features/groups/api'
import { useT } from '@/i18n/i18nContext'
import { formatDay, formatRelative } from '@/lib/dates'
import { isPositive, isValidAmount } from '@/lib/money'

import { useApproveBill, useDismissBill, usePendingBills } from './api'

/**
 * Bills from email that were not split automatically, one card each.
 *
 * Every card says why it is waiting, in words -- "the sender isn't a known
 * utility" is the thing that makes someone look twice at a bill before
 * charging their flatmates for it.
 */
export function BillsScreen() {
  const t = useT()
  const bills = usePendingBills()
  const groups = useGroups()
  const openGroups = (groups.data ?? []).filter((group) => group.archived_at === null)

  return (
    <>
      <AppBar title={t('bills.screen.title')} back="/settings" />
      <Page width="narrow">
        <p className="text-muted px-4 pt-4 text-sm">{t('bills.screen.intro')}</p>

        {bills.isLoading && (
          <div className="flex justify-center py-10">
            <Spinner size="lg" label={t('bills.screen.loading')} />
          </div>
        )}
        {bills.isError && <ErrorState error={bills.error} onRetry={() => void bills.refetch()} />}
        {bills.data && bills.data.items.length === 0 && (
          <EmptyState title={t('bills.screen.emptyTitle')} body={t('bills.screen.emptyBody')} />
        )}

        <Stack gap={3} className="pt-4">
          {bills.data?.items.map((bill) => (
            <BillCard key={bill.id} bill={bill} groups={openGroups} />
          ))}
        </Stack>
      </Page>
    </>
  )
}

function BillCard({ bill, groups }: { bill: IngestedBill; groups: Group[] }) {
  const t = useT()
  const approve = useApproveBill()
  const dismiss = useDismissBill()
  const suggested = groups.some((group) => group.id === bill.group?.id) ? bill.group?.id : ''
  const [groupId, setGroupId] = useState(suggested ?? '')
  const [amount, setAmount] = useState(bill.total_amount ?? '')

  const group = groups.find((g) => g.id === groupId)
  const currency = group?.currency ?? bill.currency ?? 'ILS'
  const amountOk = isValidAmount(amount) && isPositive(amount)
  const error = approve.error ?? dismiss.error

  return (
    <article
      aria-label={bill.provider_name ?? bill.subject ?? t('bills.card.untitled')}
      className="bg-surface border-line flex flex-col gap-3 border-y px-4 py-4"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display truncate text-lg font-extrabold">
            <bdi>{bill.provider_name ?? bill.subject ?? t('bills.card.untitled')}</bdi>
          </h2>
          <p className="text-muted text-xs">
            {bill.due_date
              ? t('bills.card.due', { date: formatDay(bill.due_date) })
              : t('bills.card.received', { when: formatRelative(bill.created_at) })}
          </p>
        </div>
        {bill.total_amount && <Money amount={bill.total_amount} currency={currency} size="lg" />}
      </header>

      {bill.review_reason && (
        <p className="bg-warn-soft text-warn rounded-sm px-3 py-2 text-sm">
          {t(`bills.reasons.${bill.review_reason}`)}
        </p>
      )}

      <div className="text-muted flex flex-col gap-0.5 text-xs">
        {bill.service_address && (
          <p>{t('bills.card.address', { address: isolate(bill.service_address) })}</p>
        )}
        {bill.sender && <p>{t('bills.card.from', { sender: isolate(bill.sender) })}</p>}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-muted font-display text-2xs font-extrabold tracking-widest uppercase">
            {t('bills.card.flat')}
          </span>
          <select
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
            className="border-line-strong bg-surface text-control h-11 rounded-md border px-3"
          >
            <option value="">{t('bills.card.pickFlat')}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-36 flex-col gap-1">
          <span className="text-muted font-display text-2xs font-extrabold tracking-widest uppercase">
            {t('bills.card.amount')}
          </span>
          <MoneyInput
            value={amount}
            onValueChange={setAmount}
            currencySymbol={currency === 'ILS' ? '₪' : currency}
            aria-label={t('bills.card.amountAria')}
            placeholder="0.00"
          />
        </label>
      </div>

      {Boolean(error) && (
        <p role="alert" className="text-danger text-sm">
          {detailOf(error)}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!groupId || !amountOk}
          loading={approve.isPending}
          onClick={() =>
            approve.mutate({
              billId: bill.id,
              groupId,
              // Only sent when it differs: the server keeps what it read otherwise.
              totalAmount: amount !== bill.total_amount ? amount : undefined,
            })
          }
        >
          {t('bills.card.approve')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          loading={dismiss.isPending}
          onClick={() => dismiss.mutate(bill.id)}
        >
          {t('bills.card.dismiss')}
        </Button>
      </div>
    </article>
  )
}

/**
 * Wrap a value in Unicode first-strong isolates so a Hebrew address inside an
 * English sentence (or an email address inside a Hebrew one) keeps its own
 * direction without reordering the words around it.
 */
function isolate(value: string): string {
  return `⁨${value}⁩`
}
