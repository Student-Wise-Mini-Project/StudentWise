import { useRef, useState } from 'react'

import { detailOf } from '@/api/errors'
import type { PlannedTransfer, SettlementMethod, User, UserBalance } from '@/api/types'
import { SETTLEMENT_METHODS } from '@/api/types'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Input, Select } from '@/components/Input'
import { ListRow, ListSection } from '@/components/ListRow'
import { Money } from '@/components/Money'
import { MoneyInput } from '@/components/MoneyInput'
import { Sheet } from '@/components/Sheet'
import { Slab } from '@/components/Slab'
import { ErrorState, ListRowSkeleton } from '@/components/feedback'
import { Stack } from '@/components/layout'
import { useAuth } from '@/features/auth/authContext'
import { useGroupScope } from '@/features/groups/groupContext'
import { useT } from '@/i18n/i18nContext'
import type { MessageKey } from '@/i18n/messages'
import type { Vars } from '@/i18n/types'
import { cn } from '@/lib/cn'
import { today } from '@/lib/dates'
import { createIdempotencyTracker } from '@/lib/idempotency'
import { settlementMethodLabel } from '@/lib/labels'
import { isPositive, isValidAmount, isZero } from '@/lib/money'
import { canPayWithApps, type PayApp } from '@/lib/payApps'

import { useBalances, useRecordSettlement, useSendReminders, useSettlementPlan } from './api'
import { PaySheet } from './PaySheet'

export function BalancesScreen() {
  const t = useT()
  const { groupId, group, currency } = useGroupScope()
  const { user } = useAuth()
  const balances = useBalances(groupId)
  const plan = useSettlementPlan(groupId)
  const remind = useSendReminders(groupId)
  const [settling, setSettling] = useState<PlannedTransfer | null>(null)
  const [settlingWith, setSettlingWith] = useState<SettlementMethod | undefined>()
  const [paying, setPaying] = useState<PlannedTransfer | null>(null)
  // The app last opened from the pay sheet, so "I paid" records the right one.
  const [openedApp, setOpenedApp] = useState<PayApp | null>(null)
  // Who has been reminded on this visit, and who is being reminded right now.
  const [reminded, setReminded] = useState<string[]>([])
  const [reminding, setReminding] = useState<string | null>(null)

  if (balances.isLoading) return <ListRowSkeleton count={3} />
  if (balances.isError) {
    return <ErrorState error={balances.error} onRetry={() => void balances.refetch()} />
  }

  const rows = balances.data?.balances ?? []
  const transfers = plan.data?.transfers ?? []

  // The transfer the person looking at this can actually do something about
  // comes first; failing that, the biggest one. A slab that leads with someone
  // else's payment is a slab about somebody else.
  const headline = transfers.find((t) => t.from_user.id === user?.id) ?? transfers[0]
  const rest = transfers.filter((t) => t !== headline)

  // Your own debts can be paid from here; anybody else's can only be recorded.
  const canPay = (transfer: PlannedTransfer) =>
    transfer.from_user.id === user?.id && canPayWithApps(currency)

  // Anyone who owes *me*. The API refuses a reminder to anyone else, so the
  // button is only offered where it would actually work.
  const myDebtors = transfers.filter((transfer) => transfer.to_user.id === user?.id)

  // One person at a time, and only someone who owes *me*: the server refuses
  // anyone else, so the button is never offered where it would fail.
  const remindOne = (transfer: PlannedTransfer) => {
    const debtorId = transfer.from_user.id
    setReminding(debtorId)
    remind.mutate([debtorId], {
      onSuccess: () => setReminded((done) => [...done, debtorId]),
      onSettled: () => setReminding(null),
    })
  }
  const remindButton = (transfer: PlannedTransfer, onSlab = false) => {
    if (transfer.to_user.id !== user?.id) return null
    if (reminded.includes(transfer.from_user.id)) {
      return (
        <span className={cn('text-xs', onSlab ? 'text-on-slab' : 'text-credit')}>
          {t('balances.remind.sent')}
        </span>
      )
    }
    return (
      <Button
        size="sm"
        variant={onSlab ? 'ghost' : 'secondary'}
        className={onSlab ? 'text-on-slab hover:bg-transparent hover:underline' : undefined}
        aria-label={t('balances.remind.aria', { name: transfer.from_user.name })}
        loading={reminding === transfer.from_user.id}
        disabled={reminding !== null}
        onClick={() => remindOne(transfer)}
      >
        {t('balances.remind.action')}
      </Button>
    )
  }

  return (
    <>
      {plan.isError ? (
        <ErrorState
          title={t('balances.planError')}
          error={plan.error}
          onRetry={() => void plan.refetch()}
        />
      ) : headline ? (
        <Slab eyebrow={t('balances.slab.eyebrow', { group: group.name, count: transfers.length })}>
          {/* The payer→payee pair is bidi-isolated as one left-to-right run.
           * Left to the document's direction it inverts under `dir="rtl"` and
           * quietly says the opposite of what happened. The sentence under it
           * carries the same fact in words, which survives any direction. */}
          <div
            dir="ltr"
            style={{ unicodeBidi: 'isolate' }}
            className="mt-3.5 flex items-center gap-3"
          >
            <Avatar user={headline.from_user} size="md" />
            <span aria-hidden="true" className="text-faint text-xl">
              →
            </span>
            <Avatar user={headline.to_user} size="md" />
            <span className="flex-1 text-end">
              <Money amount={headline.amount} currency={currency} size="display" />
            </span>
          </div>

          <p className="text-faint mt-2 text-sm" dir="auto">
            {sentenceFor(t, headline, user?.id)}
            {rest.length > 0 && restSentence(t, rest, user?.id)}
          </p>

          {canPay(headline) ? (
            <>
              <Button fullWidth size="lg" className="mt-3.5" onClick={() => setPaying(headline)}>
                {t('balances.pay.action', { name: headline.to_user.name })}
              </Button>
              {/* A ghost button is ink on paper; on the slab it has to be
               * light on dark, and a pale hover would light it up. */}
              <Button
                fullWidth
                variant="ghost"
                className="text-on-slab mt-1.5 hover:bg-transparent hover:underline active:bg-transparent"
                onClick={() => setSettling(headline)}
              >
                {t('balances.slab.record')}
              </Button>
            </>
          ) : (
            <Button fullWidth size="lg" className="mt-3.5" onClick={() => setSettling(headline)}>
              {t('balances.slab.record')}
            </Button>
          )}
          {headline.to_user.id === user?.id && (
            <div className="mt-1.5 flex justify-center">{remindButton(headline, true)}</div>
          )}
        </Slab>
      ) : (
        <Slab eyebrow={group.name}>
          <p className="font-display mt-1.5 text-4xl font-black tracking-[-0.03em]">
            {t('balances.slab.squareTitle')}
          </p>
          <p className="text-faint mt-2 text-sm">{t('balances.slab.squareBody')}</p>
        </Slab>
      )}

      <WhoIsWhere rows={rows} currency={currency} meId={user?.id} />

      {rest.length > 0 && (
        <>
          <ListSection header={t('balances.rest.header', { count: rest.length })}>
            {rest.map((transfer) => (
              <ListRow
                key={`${transfer.from_user.id}-${transfer.to_user.id}`}
                leading={<Avatar user={transfer.from_user} size="sm" />}
                title={
                  transfer.from_user.id === user?.id
                    ? t('balances.rest.rowSelf', { to: transfer.to_user.name })
                    : t('balances.rest.rowOther', {
                        from: transfer.from_user.name,
                        to: name(t, transfer.to_user, user?.id),
                      })
                }
                meta={<Money amount={transfer.amount} currency={currency} size="lg" />}
                trailing={
                  canPay(transfer) ? (
                    <Button size="sm" onClick={() => setPaying(transfer)}>
                      {t('balances.pay.rowAction')}
                    </Button>
                  ) : (
                    <span className="flex items-center gap-2">
                      {remindButton(transfer)}
                      <Button size="sm" variant="secondary" onClick={() => setSettling(transfer)}>
                        {t('common.actions.record')}
                      </Button>
                    </span>
                  )
                }
              />
            ))}
          </ListSection>
        </>
      )}

      <p className="text-muted px-4 py-3 text-xs" dir="auto">
        {t('balances.planNote')}
      </p>

      {/* Each debtor has their own Remind above; "everyone" only earns a button
       * when there is more than one of them. */}
      {myDebtors.length > 1 && (
        <div className="px-4 pb-4">
          <Button
            variant="secondary"
            fullWidth
            loading={remind.isPending && reminding === null}
            disabled={reminding !== null}
            onClick={() =>
              remind.mutate(undefined, {
                onSuccess: () => setReminded(myDebtors.map((transfer) => transfer.from_user.id)),
              })
            }
          >
            {t('balances.nudge', { count: myDebtors.length, name: '' })}
          </Button>
          {remind.isSuccess && reminding === null && (
            <p className="text-credit mt-2 text-center text-xs">{t('balances.nudgeSent')}</p>
          )}
        </div>
      )}
      {remind.isError && (
        <p role="alert" className="text-danger px-4 pb-4 text-center text-xs">
          {detailOf(remind.error)}
        </p>
      )}

      <PaySheet
        transfer={paying}
        currency={currency}
        onClose={() => {
          setPaying(null)
          setOpenedApp(null)
        }}
        onOpenApp={setOpenedApp}
        onPaid={(transfer) => {
          // Straight on to recording it, with the app already chosen: the
          // payment only counts once it is recorded.
          setPaying(null)
          setSettlingWith(openedApp ?? 'BIT')
          setOpenedApp(null)
          setSettling(transfer)
        }}
      />

      <RecordPaymentSheet
        transfer={settling}
        initialMethod={settlingWith}
        onClose={() => {
          setSettling(null)
          setSettlingWith(undefined)
        }}
      />
    </>
  )
}

/**
 * Who is up and who is down, as a shape rather than a column of numbers.
 *
 * Each row carries the signed amount, a proportional bar and the word ("is
 * owed" / "owes" / "square"). Three carriers for one fact, because red and
 * green alone is the commonest colour-vision deficiency there is, and because
 * the bar answers "by a lot, or by a bit?" faster than four digits do.
 */
function WhoIsWhere({
  rows,
  currency,
  meId,
}: {
  rows: UserBalance[]
  currency: string
  meId: string | undefined
}) {
  const t = useT()

  // The widest bar belongs to whoever is furthest from zero. This is a pixel
  // proportion, not an amount -- no money is derived from it.
  const largest = rows.reduce((max, row) => Math.max(max, Math.abs(Number(row.net))), 0)

  return (
    <section className="flex flex-col">
      <header className="px-4 pt-5 pb-2">
        <h2 className="text-muted font-display text-2xs font-extrabold tracking-widest uppercase">
          {t('balances.whoIsWhere')}
        </h2>
      </header>

      <div className="bg-surface border-line divide-line divide-y border-y">
        {rows.map((row) => {
          const square = isZero(row.net)
          const up = isPositive(row.net)
          const share = largest === 0 ? 0 : Math.abs(Number(row.net)) / largest

          return (
            <div key={row.user.id} className="px-4 py-3.5">
              <div className="flex items-center gap-3">
                <Avatar user={row.user} size="md" />
                <span className="min-w-0 flex-1 truncate text-base font-semibold">
                  {row.user.name}
                  {row.user.id === meId && (
                    <span className="text-faint font-normal">{t('common.state.youMarker')}</span>
                  )}
                </span>
                <Money
                  amount={row.net}
                  currency={currency}
                  tone={square ? 'muted' : 'auto'}
                  size="lg"
                />
              </div>

              <span
                role="img"
                aria-label={t('balances.barAria', {
                  name: row.user.name,
                  paid: row.paid,
                  owed: row.owed,
                })}
                className="bg-sunken mt-2.5 block h-1.5 w-full overflow-hidden rounded-sm"
              >
                <span
                  className={cn('block h-full rounded-sm', up ? 'bg-credit' : 'bg-debt')}
                  style={{ inlineSize: `${Math.max(share * 100, square ? 0 : 2)}%` }}
                />
              </span>

              <p
                className={cn(
                  'mt-1.5 text-xs font-semibold',
                  square ? 'text-muted' : up ? 'text-credit' : 'text-debt',
                )}
              >
                {square
                  ? t('common.state.square')
                  : up
                    ? t('common.state.credit')
                    : t('common.state.debt')}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

type T = (key: MessageKey, vars?: Vars) => string

/** "Maya pays you." — the same fact as the arrow, in words that survive a mirror. */
function sentenceFor(t: T, transfer: PlannedTransfer, meId: string | undefined): string {
  if (transfer.from_user.id === meId) {
    return t('balances.sentence.youPay', { name: transfer.to_user.name })
  }
  if (transfer.to_user.id === meId) {
    return t('balances.sentence.paysYou', { name: transfer.from_user.name })
  }
  return t('balances.sentence.pays', {
    from: transfer.from_user.name,
    to: transfer.to_user.name,
  })
}

/**
 * There used to be a `lower()` here, which lowercased a sentence's first letter
 * so it could be spliced in after the word "Then". Hebrew has no letter case,
 * and once "Then" moved into the key the English did not need it either.
 */
function restSentence(t: T, rest: PlannedTransfer[], meId: string | undefined): string {
  if (rest.length === 1 && rest[0]) {
    return t('balances.sentence.thenOne', { sentence: sentenceFor(t, rest[0], meId) })
  }
  return t('balances.sentence.thenMore', { count: rest.length })
}

function name(t: T, user: User, meId: string | undefined): string {
  return user.id === meId ? t('common.state.you') : user.name
}

function RecordPaymentSheet({
  transfer,
  initialMethod,
  onClose,
}: {
  transfer: PlannedTransfer | null
  /** Set when arriving from the pay sheet: you just paid with that app. */
  initialMethod?: SettlementMethod
  onClose: () => void
}) {
  const t = useT()
  const { groupId, currency } = useGroupScope()
  const record = useRecordSettlement(groupId)
  const idempotency = useRef(createIdempotencyTracker())

  const [amount, setAmount] = useState('')
  const [chosenMethod, setMethod] = useState<SettlementMethod | null>(null)
  const [note, setNote] = useState('')
  const [date, setDate] = useState(today())

  // The plan's amount is the sensible default, but a part payment is a real
  // thing and the field stays editable.
  const value = amount === '' ? (transfer?.amount ?? '') : amount
  const valid = isValidAmount(value) && isPositive(value)
  const method = chosenMethod ?? initialMethod ?? 'MANUAL'

  function reset() {
    setAmount('')
    setMethod(null)
    setNote('')
    setDate(today())
    record.reset()
    onClose()
  }

  return (
    <Sheet
      open={transfer !== null}
      onClose={reset}
      title={t('balances.record.title')}
      description={t('balances.record.description')}
      footer={
        <>
          <Button variant="secondary" fullWidth onClick={reset}>
            {t('common.actions.cancel')}
          </Button>
          <Button
            fullWidth
            loading={record.isPending}
            disabled={!valid}
            onClick={() => {
              if (!transfer) return
              const input = {
                from_user_id: transfer.from_user.id,
                to_user_id: transfer.to_user.id,
                amount: value,
                method,
                note: note.trim() === '' ? null : note.trim(),
                settled_at: date,
              }
              record.mutate(
                { input, idempotencyKey: idempotency.current.keyFor(input) },
                {
                  onSuccess: () => {
                    idempotency.current.consume()
                    reset()
                  },
                },
              )
            }}
          >
            {t('balances.record.submit')}
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        {record.isError && (
          <p role="alert" className="bg-danger-soft text-danger rounded-sm px-3 py-2.5 text-sm">
            {detailOf(record.error)}
          </p>
        )}

        {transfer && (
          <p className="text-base font-semibold" dir="auto">
            {t('balances.record.paidLine', {
              from: transfer.from_user.name,
              to: transfer.to_user.name,
            })}
          </p>
        )}

        <Field label={t('balances.record.howMuch')} required>
          {(props) => (
            <MoneyInput
              {...props}
              value={value}
              onValueChange={setAmount}
              currencySymbol={currency === 'ILS' ? '₪' : ''}
            />
          )}
        </Field>

        <Field label={t('balances.record.how')}>
          {(props) => (
            <Select
              {...props}
              value={method}
              onChange={(event) => setMethod(event.target.value as SettlementMethod)}
            >
              {SETTLEMENT_METHODS.map((option) => (
                <option key={option} value={option}>
                  {settlementMethodLabel(t, option)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label={t('balances.record.when')}>
          {(props) => (
            <Input
              {...props}
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          )}
        </Field>

        <Field label={t('balances.record.note')}>
          {(props) => (
            <Input
              {...props}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('balances.record.notePlaceholder')}
            />
          )}
        </Field>
      </Stack>
    </Sheet>
  )
}
