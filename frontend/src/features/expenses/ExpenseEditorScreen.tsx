import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { detailOf } from '@/api/errors'
import { EXPENSE_CATEGORIES, type ExpenseCategory, type SplitType } from '@/api/types'
import { AppBar } from '@/app/layouts/AppBar'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Input, Select, Textarea } from '@/components/Input'
import { MoneyInput } from '@/components/MoneyInput'
import { Spinner } from '@/components/Spinner'
import { ErrorState } from '@/components/feedback'
import { Page, Stack } from '@/components/layout'
import { useGroupScope } from '@/features/groups/groupContext'
import { today } from '@/lib/dates'
import { createIdempotencyTracker } from '@/lib/idempotency'
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
  members: ReturnType<typeof useGroupScope>['activeMembers']
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
  const me = members[0]
  const [form, setForm] = useState<FormState>(
    initial ?? {
      title: '',
      amount: '',
      date: today(),
      payerId: me?.user.id ?? '',
      category: '',
      notes: '',
      splitType: 'EQUAL',
      // Everyone is on it by default, which is the overwhelmingly common case.
      participants: members.map((member) => ({ userId: member.user.id, shareValue: '' })),
    },
  )

  const patch = (next: Partial<FormState>) => setForm((current) => ({ ...current, ...next }))

  const amountOk = isValidAmount(form.amount) && isPositive(form.amount)
  const split = useMemo(
    () => validateSplit(form.splitType, form.participants, form.amount),
    [form.splitType, form.participants, form.amount],
  )
  const canSave = form.title.trim().length > 0 && amountOk && Boolean(form.payerId) && split.valid

  return (
    <>
      <AppBar
        title={mode === 'create' ? 'Add an expense' : 'Edit expense'}
        back
        actions={
          <Button size="sm" loading={pending} disabled={!canSave} onClick={submit}>
            Save
          </Button>
        }
      />

      <Page width="narrow">
        <Stack gap={5} className="px-4 py-4">
          {Boolean(error) && (
            <p role="alert" className="bg-danger-soft text-danger rounded-lg px-3 py-2.5 text-sm">
              {detailOf(error)}
            </p>
          )}

          <Field label="What was it?" required>
            {(props) => (
              <Input
                {...props}
                value={form.title}
                onChange={(event) => patch({ title: event.target.value })}
                maxLength={200}
                autoFocus={mode === 'create'}
              />
            )}
          </Field>

          <Field
            label="How much?"
            required
            error={form.amount !== '' && !amountOk ? 'Has to be more than zero.' : undefined}
          >
            {(props) => (
              <MoneyInput
                {...props}
                value={form.amount}
                onValueChange={(amount) => patch({ amount })}
                currencySymbol={currency === 'ILS' ? '₪' : ''}
              />
            )}
          </Field>

          <Field label="Who paid?" required>
            {(props) => (
              <Select
                {...props}
                value={form.payerId}
                onChange={(event) => patch({ payerId: event.target.value })}
              >
                {members.map((member) => (
                  <option key={member.user.id} value={member.user.id}>
                    {member.user.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="When?" required>
            {(props) => (
              <Input
                {...props}
                type="date"
                value={form.date}
                onChange={(event) => patch({ date: event.target.value })}
              />
            )}
          </Field>

          <Field label="Category" hint="Leaving this blank is fine; the charts call it Other.">
            {(props) => (
              <Select
                {...props}
                value={form.category}
                onChange={(event) =>
                  patch({ category: event.target.value as ExpenseCategory | '' })
                }
              >
                <option value="">No category</option>
                {EXPENSE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {categoryLabel[category]}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <div className="flex flex-col gap-2">
            <span className="text-ink text-sm font-semibold">Split between</span>
            <SplitEditor
              members={members}
              splitType={form.splitType}
              onSplitTypeChange={(splitType) => patch({ splitType })}
              participants={form.participants}
              onParticipantsChange={(participants) => patch({ participants })}
              total={amountOk ? form.amount : '0.00'}
              currency={currency}
            />
          </div>

          <Field label="Notes">
            {(props) => (
              <Textarea
                {...props}
                value={form.notes}
                onChange={(event) => patch({ notes: event.target.value })}
                placeholder="Optional"
              />
            )}
          </Field>

          <Stack direction="row" gap={2}>
            <Button variant="secondary" fullWidth onClick={onCancel}>
              Cancel
            </Button>
            <Button fullWidth size="lg" loading={pending} disabled={!canSave} onClick={submit}>
              {mode === 'create' ? 'Add it' : 'Save'}
            </Button>
          </Stack>
        </Stack>
      </Page>
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
