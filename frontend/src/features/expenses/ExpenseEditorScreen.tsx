import { type ReactNode, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { detailOf } from '@/api/errors'
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type GroupMember,
  type SplitType,
} from '@/api/types'
import { AppBar } from '@/app/layouts/AppBar'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { MoneyInput } from '@/components/MoneyInput'
import { Sheet } from '@/components/Sheet'
import { Spinner } from '@/components/Spinner'
import { ErrorState } from '@/components/feedback'
import { CheckIcon, ChevronEnd } from '@/components/icons'
import { Page } from '@/components/layout'
import { useGroupScope } from '@/features/groups/groupContext'
import { cn } from '@/lib/cn'
import { today } from '@/lib/dates'
import { createIdempotencyTracker } from '@/lib/idempotency'
import { useT } from '@/i18n/i18nContext'
import { categoryLabel } from '@/lib/labels'
import { isPositive, isValidAmount } from '@/lib/money'

import { SplitEditor } from './SplitEditor'
import { useCreateExpense, useExpense, useUpdateExpense } from './api'
import { validateSplit, type ParticipantDraft } from './splitValidation'

export function NewExpenseScreen() {
  const { groupId, activeMembers, currency } = useGroupScope()
  const navigate = useNavigate()
  const create = useCreateExpense(groupId)

  // One tracker per open form. A key is minted on the first submit, reused for a
  // retry of the same body, and replaced the moment a field changes -- because
  // the same key with a different body is a 409, and that would surface as a
  // baffling "conflict" on a fixed typo.
  const idempotency = useRef(createIdempotencyTracker())

  return (
    <ExpenseForm
      mode="create"
      members={activeMembers}
      currency={currency}
      pending={create.isPending}
      error={create.error}
      onCancel={() => navigate(`/groups/${groupId}`)}
      onSubmit={(input) =>
        create.mutate(
          { input, idempotencyKey: idempotency.current.keyFor(input) },
          {
            onSuccess: (expense) => {
              idempotency.current.consume()
              navigate(`/groups/${groupId}/expenses/${expense.id}`, { replace: true })
            },
          },
        )
      }
    />
  )
}

export function EditExpenseScreen() {
  const { expenseId } = useParams<{ expenseId: string }>()
  const navigate = useNavigate()
  const query = useExpense(expenseId)
  const { activeMembers, currency, groupId } = useGroupScope()
  const update = useUpdateExpense(groupId, expenseId ?? '')

  if (query.isLoading) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center">
        <Spinner size="lg" label="Loading" />
      </div>
    )
  }
  if (query.isError || !query.data) {
    return (
      <Page width="narrow">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </Page>
    )
  }

  const expense = query.data

  return (
    <ExpenseForm
      mode="edit"
      members={activeMembers}
      currency={currency}
      pending={update.isPending}
      error={update.error}
      initial={{
        title: expense.title,
        amount: expense.total_amount,
        date: expense.expense_date,
        payerId: expense.payer.id,
        category: expense.category ?? '',
        notes: expense.notes ?? '',
        splitType: expense.split_type,
        participants: expense.splits.map((split) => ({
          userId: split.user.id,
          // On an EXACT split the server's own allocation is the sensible
          // starting point. For the other modes `share_value` is the percentage
          // or weight that was stored.
          shareValue:
            expense.split_type === 'EXACT' ? split.owed_amount : (split.share_value ?? ''),
        })),
      }}
      onCancel={() => navigate(`/groups/${groupId}/expenses/${expense.id}`)}
      onSubmit={(input) =>
        update.mutate(input, {
          onSuccess: () => navigate(`/groups/${groupId}/expenses/${expense.id}`, { replace: true }),
        })
      }
    />
  )
}

type FormState = {
  title: string
  amount: string
  date: string
  payerId: string
  category: ExpenseCategory | ''
  notes: string
  splitType: SplitType
  participants: ParticipantDraft[]
}

/**
 * "₪212.30, split equally between all three", in about four taps.
 *
 * The amount is the screen: it comes first, centred, at 44px over a rule with
 * no box around it, because it is the one thing that is always typed and
 * everything else has a sensible default. Under it the rest of the expense is
 * a band of label/value rows rather than a stack of captioned boxes — a form
 * with six framed fields reads as six decisions, and five of these are already
 * made.
 */
function ExpenseForm({
  mode,
  members,
  currency,
  initial,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  mode: 'create' | 'edit'
  members: GroupMember[]
  currency: string
  initial?: FormState
  pending: boolean
  error: unknown
  onSubmit: (input: {
    title: string
    total_amount: string
    expense_date: string
    payer_id: string
    split_type: SplitType
    participants: { user_id: string; share_value?: string }[]
    category: ExpenseCategory | null
    notes: string | null
  }) => void
  onCancel: () => void
}) {
  const t = useT()
  const { group, me } = useGroupScope()
  // The signed-in member, and only if they are still in the group -- the API
  // rejects a payer who has left. `members[0]` used to stand in for this, and
  // the membership list arrives in no particular order, so the form quietly
  // offered to record your shopping as a flatmate's.
  const defaultPayer = members.find((member) => member.user.id === me?.user.id)
  const [form, setForm] = useState<FormState>(
    initial ?? {
      title: '',
      amount: '',
      date: today(),
      // Empty leaves the row reading "Pick someone" and the save button
      // disabled, which is the honest state: better an extra tap than an
      // expense silently attributed to whoever the database listed first.
      payerId: defaultPayer?.user.id ?? '',
      category: '',
      notes: '',
      splitType: 'EQUAL',
      // Everyone is on it by default, which is the overwhelmingly common case.
      participants: members.map((member) => ({ userId: member.user.id, shareValue: '' })),
    },
  )
  const [payerSheetOpen, setPayerSheetOpen] = useState(false)

  const patch = (next: Partial<FormState>) => setForm((current) => ({ ...current, ...next }))

  const amountOk = isValidAmount(form.amount) && isPositive(form.amount)
  const split = useMemo(
    () => validateSplit(form.splitType, form.participants, form.amount),
    [form.splitType, form.participants, form.amount],
  )
  const canSave = form.title.trim().length > 0 && amountOk && Boolean(form.payerId) && split.valid
  const payer = members.find((member) => member.user.id === form.payerId)

  return (
    <>
      <AppBar
        variant="modal"
        title={mode === 'create' ? 'New expense' : 'Edit expense'}
        leading={
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        }
      />

      <Page width="narrow">
        {Boolean(error) && (
          <p
            role="alert"
            className="bg-danger-soft text-danger mx-4 mt-4 rounded-sm px-3 py-2.5 text-sm"
            dir="auto"
          >
            {detailOf(error)}
          </p>
        )}

        {/* The amount, first and largest. No box: a 44px number inside a
         * bordered field looks like a mistake, and there is nothing to
         * disambiguate it from at this size anyway. */}
        <div className="px-4 pt-3 pb-4 text-center">
          <MoneyInput
            size="hero"
            value={form.amount}
            onValueChange={(amount) => patch({ amount })}
            currencySymbol={currency === 'ILS' ? '₪' : currency}
            aria-label="Amount"
            placeholder="0.00"
            autoFocus={mode === 'create'}
            className="w-40 text-center"
          />
          <p className="text-muted mt-2.5 text-xs" dir="auto">
            {group.name} · {currency}
            {form.amount !== '' && !amountOk && (
              <span className="text-danger"> · has to be more than zero</span>
            )}
          </p>
        </div>

        <div className="bg-surface border-line divide-line divide-y border-y">
          <LabelRow label="What">
            <input
              value={form.title}
              onChange={(event) => patch({ title: event.target.value })}
              maxLength={200}
              aria-label="What was it?"
              placeholder="Supermarket"
              className="placeholder:text-faint text-control w-full border-0 bg-transparent font-semibold outline-none"
            />
          </LabelRow>

          <LabelRow label="Paid by" onClick={() => setPayerSheetOpen(true)}>
            <span className="flex items-center gap-2">
              {payer && <Avatar user={payer.user} size="xs" />}
              <span className="text-base font-semibold">{payer?.user.name ?? 'Pick someone'}</span>
            </span>
          </LabelRow>

          <LabelRow label="When">
            <input
              type="date"
              value={form.date}
              onChange={(event) => patch({ date: event.target.value })}
              aria-label="When?"
              className="tnum text-control w-full border-0 bg-transparent font-semibold outline-none"
            />
          </LabelRow>

          <LabelRow label="Note">
            <input
              value={form.notes}
              onChange={(event) => patch({ notes: event.target.value })}
              aria-label="Notes"
              placeholder="Optional"
              className="placeholder:text-faint text-control w-full border-0 bg-transparent outline-none"
            />
          </LabelRow>

          {/* Chips rather than a dropdown: there are seven of these, they are
           * all one word, and a category is chosen by recognition rather than
           * by reading a list. */}
          <div className="px-4 py-3">
            <span
              id="category-label"
              className="text-muted font-display text-2xs block font-extrabold tracking-[0.08em] uppercase"
            >
              Category
            </span>
            <div
              role="group"
              aria-labelledby="category-label"
              className="mt-2.5 flex flex-wrap gap-2"
            >
              {EXPENSE_CATEGORIES.map((category) => {
                const on = form.category === category
                return (
                  <button
                    key={category}
                    type="button"
                    aria-pressed={on}
                    onClick={() => patch({ category: on ? '' : category })}
                    className={cn(
                      'font-display h-8 rounded-sm border px-3 text-sm font-bold transition-colors',
                      on
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-line text-muted hover:text-ink',
                    )}
                  >
                    {categoryLabel(t, category)}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <SplitEditor
          members={members}
          splitType={form.splitType}
          onSplitTypeChange={(splitType) => patch({ splitType })}
          participants={form.participants}
          onParticipantsChange={(participants) => patch({ participants })}
          total={amountOk ? form.amount : '0.00'}
          currency={currency}
        />

        <div className="px-4 pt-6">
          <Button fullWidth size="lg" loading={pending} disabled={!canSave} onClick={submit}>
            {mode === 'create' ? 'Save expense' : 'Save changes'}
          </Button>
        </div>
      </Page>

      <Sheet
        open={payerSheetOpen}
        onClose={() => setPayerSheetOpen(false)}
        title="Who paid?"
        className="sm:max-w-sm"
      >
        <div className="divide-line -my-1 divide-y">
          {members.map((member) => {
            const chosen = member.user.id === form.payerId
            return (
              <button
                key={member.user.id}
                type="button"
                onClick={() => {
                  patch({ payerId: member.user.id })
                  setPayerSheetOpen(false)
                }}
                className="flex w-full items-center gap-3 py-2.5 text-start"
              >
                <Avatar user={member.user} size="sm" />
                <span className="flex-1 truncate text-base font-semibold">{member.user.name}</span>
                {chosen && <CheckIcon className="text-accent size-5 shrink-0" />}
              </button>
            )
          })}
        </div>
      </Sheet>
    </>
  )

  function submit() {
    if (!canSave) return
    onSubmit({
      title: form.title.trim(),
      total_amount: form.amount,
      expense_date: form.date,
      payer_id: form.payerId,
      split_type: form.splitType,
      participants: form.participants.map((participant) => ({
        user_id: participant.userId,
        // EQUAL carries no per-person value at all: sending one would be the
        // client claiming to know the split.
        ...(form.splitType === 'EQUAL' ? {} : { share_value: participant.shareValue }),
      })),
      category: form.category === '' ? null : form.category,
      notes: form.notes.trim() === '' ? null : form.notes.trim(),
    })
  }
}

/**
 * One row of the details band: a fixed-width eyebrow and a value that fills the
 * rest. The labels share a column so the values line up, which is what makes
 * four rows read as one object rather than four fields.
 */
function LabelRow({
  label,
  onClick,
  children,
}: {
  label: string
  onClick?: () => void
  children: ReactNode
}) {
  const body = (
    <>
      <span className="text-muted font-display text-2xs w-[4.5rem] shrink-0 font-extrabold tracking-[0.08em] uppercase">
        {label}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      {onClick && <ChevronEnd className="text-faint size-5 shrink-0" />}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="hover:bg-sunken flex w-full items-center gap-3 px-4 py-3 text-start transition-colors"
      >
        {body}
      </button>
    )
  }
  return <div className="flex items-center gap-3 px-4 py-3">{body}</div>
}
