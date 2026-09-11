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
import { cn } from '@/lib/cn'
import { today } from '@/lib/dates'
import { createIdempotencyTracker } from '@/lib/idempotency'
import { settlementMethodLabel } from '@/lib/labels'
import { isPositive, isValidAmount, isZero } from '@/lib/money'

import { useBalances, useRecordSettlement, useSendReminders, useSettlementPlan } from './api'

export function BalancesScreen() {
  const { groupId, group, currency } = useGroupScope()
  const { user } = useAuth()
  const balances = useBalances(groupId)
  const plan = useSettlementPlan(groupId)
  const remind = useSendReminders(groupId)
  const [settling, setSettling] = useState<PlannedTransfer | null>(null)

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

  // Anyone who owes *me*. The API refuses a reminder to anyone else, so the
  // button is only offered where it would actually work.
  const myDebtors = transfers.filter((transfer) => transfer.to_user.id === user?.id)

  return (
    <>
      {plan.isError ? (
        <ErrorState
          title="Cannot work out a plan"
          error={plan.error}
          onRetry={() => void plan.refetch()}
        />
      ) : headline ? (
        <Slab
          eyebrow={`${group.name} · ${transfers.length === 1 ? 'one transfer clears it' : `${transfers.length} transfers clear it`}`}
        >
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
            {sentenceFor(headline, user?.id)}
            {rest.length > 0 && ` ${restSentence(rest, user?.id)}`}
          </p>

          <Button fullWidth size="lg" className="mt-3.5" onClick={() => setSettling(headline)}>
            Record that this happened
          </Button>
        </Slab>
      ) : (
        <Slab eyebrow={group.name}>
          <p className="font-display mt-1.5 text-4xl font-black tracking-[-0.03em]">
            Everyone is square.
          </p>
          <p className="text-faint mt-2 text-sm">No payments needed.</p>
        </Slab>
      )}

      <WhoIsWhere rows={rows} currency={currency} meId={user?.id} />

      {rest.length > 0 && (
        <>
          <ListSection header={rest.length === 1 ? 'And one more' : `And ${rest.length} more`}>
            {rest.map((transfer) => (
              <ListRow
                key={`${transfer.from_user.id}-${transfer.to_user.id}`}
                leading={<Avatar user={transfer.from_user} size="sm" />}
                title={
                  <>
                    {name(transfer.from_user, user?.id)}{' '}
                    {transfer.from_user.id === user?.id ? 'pay' : 'pays'}{' '}
                    {name(transfer.to_user, user?.id)}
                  </>
                }
                meta={<Money amount={transfer.amount} currency={currency} size="lg" />}
                trailing={
                  <Button size="sm" variant="secondary" onClick={() => setSettling(transfer)}>
                    Record
                  </Button>
                }
              />
            ))}
          </ListSection>
        </>
      )}

      <p className="text-muted px-4 py-3 text-xs" dir="auto">
        This is the fewest transfers that clears everyone, and it is only a suggestion &mdash;
        nothing changes until you record a payment that actually happened. Balances always add up to
        zero, and someone who has left the group stays here until they are square: leaving does not
        erase a debt.
      </p>

      {myDebtors.length > 0 && (
        <div className="px-4 pb-4">
          <Button
            variant="secondary"
            fullWidth
            loading={remind.isPending}
            onClick={() => remind.mutate(undefined)}
          >
            Nudge {myDebtors.length === 1 ? myDebtors[0]?.from_user.name : 'everyone who owes you'}
          </Button>
          {remind.isSuccess && (
            <p className="text-credit mt-2 text-center text-xs">Reminder sent.</p>
          )}
          {remind.isError && (
            <p role="alert" className="text-danger mt-2 text-center text-xs">
              {detailOf(remind.error)}
            </p>
          )}
        </div>
      )}

      <RecordPaymentSheet transfer={settling} onClose={() => setSettling(null)} />
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
  // The widest bar belongs to whoever is furthest from zero. This is a pixel
  // proportion, not an amount -- no money is derived from it.
  const largest = rows.reduce((max, row) => Math.max(max, Math.abs(Number(row.net))), 0)

  return (
    <section className="flex flex-col">
      <header className="px-4 pt-5 pb-2">
        <h2 className="text-muted font-display text-2xs font-extrabold tracking-[0.1em] uppercase">
          Who is up, who is down
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
                  {row.user.id === meId && <span className="text-faint font-normal"> (you)</span>}
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
                aria-label={`${row.user.name}: paid ${row.paid}, used ${row.owed}`}
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
                {square ? 'square' : up ? 'is owed' : 'owes'}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** "Maya pays you." — the same fact as the arrow, in words that survive a mirror. */
function sentenceFor(transfer: PlannedTransfer, meId: string | undefined): string {
  if (transfer.from_user.id === meId) return `You pay ${transfer.to_user.name}.`
  if (transfer.to_user.id === meId) return `${transfer.from_user.name} pays you.`
  return `${transfer.from_user.name} pays ${transfer.to_user.name}.`
}

function restSentence(rest: PlannedTransfer[], meId: string | undefined): string {
  if (rest.length === 1 && rest[0]) return `Then ${lower(sentenceFor(rest[0], meId))}`
  return `Then ${rest.length} more, in that order.`
}

function lower(sentence: string): string {
  return sentence.charAt(0).toLowerCase() + sentence.slice(1)
}

function name(user: User, meId: string | undefined): string {
  return user.id === meId ? 'You' : user.name
}

function RecordPaymentSheet({
  transfer,
  onClose,
}: {
  transfer: PlannedTransfer | null
  onClose: () => void
}) {
  const { groupId, currency } = useGroupScope()
  const record = useRecordSettlement(groupId)
  const idempotency = useRef(createIdempotencyTracker())

  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<SettlementMethod>('MANUAL')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(today())

  // The plan's amount is the sensible default, but a part payment is a real
  // thing and the field stays editable.
  const value = amount === '' ? (transfer?.amount ?? '') : amount
  const valid = isValidAmount(value) && isPositive(value)

  function reset() {
    setAmount('')
    setMethod('MANUAL')
    setNote('')
    setDate(today())
    record.reset()
    onClose()
  }

  return (
    <Sheet
      open={transfer !== null}
      onClose={reset}
      title="Record a payment"
      description="This is what actually moves the balances."
      footer={
        <>
          <Button variant="secondary" fullWidth onClick={reset}>
            Cancel
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
            Record it
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
          <p className="text-base" dir="auto">
            <span className="font-semibold">{transfer.from_user.name}</span> paid{' '}
            <span className="font-semibold">{transfer.to_user.name}</span>
          </p>
        )}

        <Field label="How much?" required>
          {(props) => (
            <MoneyInput
              {...props}
              value={value}
              onValueChange={setAmount}
              currencySymbol={currency === 'ILS' ? '₪' : ''}
            />
          )}
        </Field>

        <Field label="How?">
          {(props) => (
            <Select
              {...props}
              value={method}
              onChange={(event) => setMethod(event.target.value as SettlementMethod)}
            >
              {SETTLEMENT_METHODS.map((option) => (
                <option key={option} value={option}>
                  {settlementMethodLabel[option]}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="When?">
          {(props) => (
            <Input
              {...props}
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          )}
        </Field>

        <Field label="Note">
          {(props) => (
            <Input
              {...props}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional"
            />
          )}
        </Field>
      </Stack>
    </Sheet>
  )
}
