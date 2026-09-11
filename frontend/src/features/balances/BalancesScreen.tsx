import { useRef, useState } from 'react'

import { detailOf } from '@/api/errors'
import type { PlannedTransfer, SettlementMethod, User } from '@/api/types'
import { SETTLEMENT_METHODS } from '@/api/types'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Field } from '@/components/Field'
import { Input, Select } from '@/components/Input'
import { ListRow, ListSection } from '@/components/ListRow'
import { Money } from '@/components/Money'
import { MoneyInput } from '@/components/MoneyInput'
import { Sheet } from '@/components/Sheet'
import { EmptyState, ErrorState, ListRowSkeleton } from '@/components/feedback'
import { CheckIcon } from '@/components/icons'
import { Stack } from '@/components/layout'
import { useAuth } from '@/features/auth/authContext'
import { useGroupScope } from '@/features/groups/groupContext'
import { today } from '@/lib/dates'
import { createIdempotencyTracker } from '@/lib/idempotency'
import { settlementMethodLabel } from '@/lib/labels'
import { isPositive, isValidAmount, isZero } from '@/lib/money'

import { useBalances, useRecordSettlement, useSendReminders, useSettlementPlan } from './api'

export function BalancesScreen() {
  const { groupId, currency } = useGroupScope()
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
  const mine = rows.find((row) => row.user.id === user?.id)
  const everyoneSquare = rows.every((row) => isZero(row.net))

  // Anyone who owes *me*. The API refuses a reminder to anyone else, so the
  // button is only offered where it would actually work.
  const myDebtors = (plan.data?.transfers ?? []).filter(
    (transfer) => transfer.to_user.id === user?.id,
  )

  return (
    <>
      {mine && (
        <Card className="mx-4 mt-4" elevated>
          <Stack gap={1} className="items-center py-3 text-center">
            <p className="text-muted text-sm font-medium">
              {isZero(mine.net)
                ? 'You are square'
                : isPositive(mine.net)
                  ? 'You are owed'
                  : 'You owe'}
            </p>
            {!isZero(mine.net) && (
              <Money amount={mine.net} currency={currency} tone="auto" size="display" />
            )}
            <p className="text-muted mt-1 text-xs">
              Paid <Money amount={mine.paid} currency={currency} size="sm" /> · consumed{' '}
              <Money amount={mine.owed} currency={currency} size="sm" />
            </p>
          </Stack>
        </Card>
      )}

      <ListSection header="Everyone">
        {rows.map((row) => (
          <ListRow
            key={row.user.id}
            leading={<Avatar user={row.user} />}
            title={row.user.id === user?.id ? `${row.user.name} (you)` : row.user.name}
            subtitle={
              isZero(row.net)
                ? 'Square'
                : isPositive(row.net)
                  ? 'Is owed by the group'
                  : 'Owes the group'
            }
            meta={
              <Money amount={row.net} currency={currency} tone="auto" sign="always" size="lg" />
            }
          />
        ))}
      </ListSection>

      <p className="text-muted px-4 py-3 text-xs">
        These always add up to zero. Someone who has left the group still appears here until they
        are square &mdash; leaving does not erase a debt.
      </p>

      <SettleUpSection
        transfers={plan.data?.transfers ?? []}
        loading={plan.isLoading}
        error={plan.isError ? plan.error : null}
        onRetry={() => void plan.refetch()}
        currency={currency}
        meId={user?.id}
        everyoneSquare={everyoneSquare}
        onSettle={setSettling}
      />

      {myDebtors.length > 0 && (
        <div className="px-4 py-4">
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

function SettleUpSection({
  transfers,
  loading,
  error,
  onRetry,
  currency,
  meId,
  everyoneSquare,
  onSettle,
}: {
  transfers: PlannedTransfer[]
  loading: boolean
  error: unknown
  onRetry: () => void
  currency: string
  meId: string | undefined
  everyoneSquare: boolean
  onSettle: (transfer: PlannedTransfer) => void
}) {
  if (loading) return <ListRowSkeleton count={2} />
  if (error) return <ErrorState title="Cannot work out a plan" error={error} onRetry={onRetry} />

  if (transfers.length === 0) {
    return (
      <EmptyState
        icon={<CheckIcon className="size-10" />}
        title={everyoneSquare ? 'Everyone is square' : 'Nothing to settle'}
        body="No payments needed."
        size="inline"
      />
    )
  }

  return (
    <>
      <ListSection header={`Settle up in ${transfers.length}`}>
        {transfers.map((transfer) => (
          <ListRow
            key={`${transfer.from_user.id}-${transfer.to_user.id}`}
            leading={<Avatar user={transfer.from_user} size="sm" />}
            title={
              <>
                {name(transfer.from_user, meId)} {transfer.from_user.id === meId ? 'pay' : 'pays'}{' '}
                {name(transfer.to_user, meId)}
              </>
            }
            subtitle={transfer.from_user.id === meId ? 'This one is yours' : undefined}
            meta={<Money amount={transfer.amount} currency={currency} size="lg" />}
            trailing={
              <Button size="sm" variant="secondary" onClick={() => onSettle(transfer)}>
                Record
              </Button>
            }
          />
        ))}
      </ListSection>

      <p className="text-muted px-4 py-3 text-xs">
        This is the fewest transfers that clears everyone, and it is only a suggestion &mdash;
        nothing changes until you record a payment that actually happened.
      </p>
    </>
  )
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
          <p role="alert" className="bg-danger-soft text-danger rounded-lg px-3 py-2.5 text-sm">
            {detailOf(record.error)}
          </p>
        )}

        {transfer && (
          <p className="text-base">
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
