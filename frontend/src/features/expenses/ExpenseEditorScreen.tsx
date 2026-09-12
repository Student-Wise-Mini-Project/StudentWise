import { type ReactNode, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { detailOf } from '@/api/errors'
import {
  EXPENSE_CATEGORIES,
  RECURRENCE_FREQUENCIES,
  type ExpenseCategory,
  type GroupMember,
  type RecurrenceFrequency,
  type RecurringBillCreate,
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

import { useCreateBill } from '@/features/recurring/api'
import { frequencyLabel } from '@/features/recurring/labels'
import { onePeriodAfter } from '@/features/recurring/nextPeriod'

import { SplitEditor } from './SplitEditor'
import { useCreateExpense, useExpense, useUpdateExpense } from './api'
import { validateSplit, type ParticipantDraft } from './splitValidation'

export function NewExpenseScreen() {
  const t = useT()
  const { groupId, activeMembers, currency } = useGroupScope()
  const navigate = useNavigate()
  const create = useCreateExpense(groupId)
  const createBill = useCreateBill(groupId)

  // One tracker per open form. A key is minted on the first submit, reused for a
  // retry of the same body, and replaced the moment a field changes -- because
  // the same key with a different body is a 409, and that would surface as a
  // baffling "conflict" on a fixed typo.
  const idempotency = useRef(createIdempotencyTracker())

  // Held so the retry can re-send only the bill, without the expense.
  const [scheduleFailed, setScheduleFailed] = useState<RecurringBillCreate | null>(null)

  /**
   * Set up the schedule the "Repeats" row asked for, then leave.
   *
   * Two requests, not one transaction, and the spec accepts that: a `recurring`
   * block on `ExpenseCreate` would be the atomically-correct answer, but it
   * would also make `expense_service` call `recurring_bill_service`, and the
   * dependency deliberately points the other way.
   *
   * What the non-atomicity is not allowed to be is silent. A bill that quietly
   * never recurs is found out the month it was needed.
   */
  function scheduleThenLeave(bill: RecurringBillCreate, expenseId: string) {
    createBill.mutate(bill, {
      onSuccess: () => navigate(`/groups/${groupId}/expenses/${expenseId}`, { replace: true }),
      onError: () => setScheduleFailed(bill),
    })
  }

  return (
    <>
      {scheduleFailed && (
        <div className="bg-danger-soft mx-4 mt-4 rounded-sm px-3 py-2.5">
          <p role="alert" className="text-danger text-sm">
            {t('expenses.repeats.scheduleFailed')}
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            loading={createBill.isPending}
            onClick={() => {
              const bill = scheduleFailed
              setScheduleFailed(null)
              createBill.mutate(bill, {
                onSuccess: () => navigate(`/groups/${groupId}`, { replace: true }),
                onError: () => setScheduleFailed(bill),
              })
            }}
          >
            {t('expenses.repeats.retry')}
          </Button>
        </div>
      )}

      <ExpenseForm
        mode="create"
        members={activeMembers}
        currency={currency}
        pending={create.isPending || createBill.isPending}
        error={create.error}
        onCancel={() => navigate(`/groups/${groupId}`)}
        onSubmit={({ repeats, ...input }) =>
          create.mutate(
            { input, idempotencyKey: idempotency.current.keyFor(input) },
            {
              onSuccess: (expense) => {
                idempotency.current.consume()

                if (!repeats) {
                  navigate(`/groups/${groupId}/expenses/${expense.id}`, { replace: true })
                  return
                }

                scheduleThenLeave(
                  {
                    title: input.title,
                    frequency: repeats,
                    // One period after this expense, never on it: the expense
                    // just added *is* this period's, and a schedule due the
                    // same day would post it twice.
                    first_due_on: onePeriodAfter(input.expense_date, repeats),
                    payer_id: input.payer_id,
                    amount: input.total_amount,
                    category: input.category,
                    // EQUAL, and no participants: the API then falls back to
                    // every active member, or to a standing split rule.
                    split_type: 'EQUAL',
                    reminder_days_before: 3,
                  },
                  expense.id,
                )
              },
            },
          )
        }
      />
    </>
  )
}

export function EditExpenseScreen() {
  const { expenseId } = useParams<{ expenseId: string }>()
  const navigate = useNavigate()
  const query = useExpense(expenseId)
  const t = useT()
  const { activeMembers, currency, groupId } = useGroupScope()
  const update = useUpdateExpense(groupId, expenseId ?? '')

  if (query.isLoading) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center">
        <Spinner size="lg" label={t('common.actions.loading')} />
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
    /** Create mode only. Null means this expense does not repeat. */
    repeats: RecurrenceFrequency | null
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
  // Create mode only, and deliberately outside `FormState`: editing an expense
  // must never silently rewrite a schedule.
  const [repeats, setRepeats] = useState<RecurrenceFrequency | ''>('')

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
        title={
          mode === 'create' ? t('expenses.editor.createTitle') : t('expenses.editor.editTitle')
        }
        leading={
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t('common.actions.cancel')}
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
            aria-label={t('expenses.editor.amount')}
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
          <LabelRow label={t('expenses.editor.what')}>
            <input
              value={form.title}
              onChange={(event) => patch({ title: event.target.value })}
              maxLength={200}
              aria-label={t('expenses.editor.whatAria')}
              placeholder={t('expenses.editor.whatPlaceholder')}
              className="placeholder:text-faint text-control w-full border-0 bg-transparent font-semibold outline-none"
            />
          </LabelRow>

          <LabelRow label={t('expenses.editor.paidBy')} onClick={() => setPayerSheetOpen(true)}>
            <span className="flex items-center gap-2">
              {payer && <Avatar user={payer.user} size="xs" />}
              <span className="text-base font-semibold">
                {payer?.user.name ?? t('expenses.editor.pickSomeone')}
              </span>
            </span>
          </LabelRow>

          <LabelRow label={t('expenses.editor.when')}>
            <input
              type="date"
              value={form.date}
              onChange={(event) => patch({ date: event.target.value })}
              aria-label={t('expenses.editor.whenAria')}
              className="tnum text-control w-full border-0 bg-transparent font-semibold outline-none"
            />
          </LabelRow>

          {mode === 'create' && (
            <LabelRow label={t('expenses.repeats.label')}>
              <select
                value={repeats}
                onChange={(event) => setRepeats(event.target.value as RecurrenceFrequency | '')}
                aria-label={t('expenses.repeats.label')}
                className="text-control w-full border-0 bg-transparent font-semibold outline-none"
              >
                <option value="">{t('expenses.repeats.never')}</option>
                {RECURRENCE_FREQUENCIES.map((option) => (
                  <option key={option} value={option}>
                    {frequencyLabel(t, option)}
                  </option>
                ))}
              </select>
            </LabelRow>
          )}

          {mode === 'create' && repeats !== '' && (
            // Worth saying: the expense being added is this period's, so the
            // schedule starts on the next one. Otherwise adding September's
            // rent and seeing "next due October" reads as an off-by-one.
            <p className="text-muted px-4 pb-3 text-xs" dir="auto">
              {t('expenses.repeats.hint')}
            </p>
          )}

          <LabelRow label={t('expenses.editor.note')}>
            <input
              value={form.notes}
              onChange={(event) => patch({ notes: event.target.value })}
              aria-label={t('expenses.editor.notesAria')}
              placeholder={t('expenses.editor.notePlaceholder')}
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
              {t('expenses.editor.category')}
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
            {mode === 'create' ? t('expenses.editor.saveCreate') : t('expenses.editor.saveEdit')}
          </Button>
        </div>
      </Page>

      <Sheet
        open={payerSheetOpen}
        onClose={() => setPayerSheetOpen(false)}
        title={t('expenses.editor.whoPaid')}
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
      repeats: repeats === '' ? null : repeats,
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
