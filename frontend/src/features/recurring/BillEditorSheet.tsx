import { useState } from 'react'

import { detailOf } from '@/api/errors'
import {
  EXPENSE_CATEGORIES,
  RECURRENCE_FREQUENCIES,
  type ExpenseCategory,
  type RecurrenceFrequency,
  type RecurringBill,
  type SplitType,
} from '@/api/types'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Input, Select } from '@/components/Input'
import { MoneyInput } from '@/components/MoneyInput'
import { Sheet } from '@/components/Sheet'
import { Stack } from '@/components/layout'
import { useAuth } from '@/features/auth/authContext'
import { useGroupScope } from '@/features/groups/groupContext'
import { useT } from '@/i18n/i18nContext'
import { today } from '@/lib/dates'
import { categoryLabel, splitTypeLabel } from '@/lib/labels'
import { isPositive, isValidAmount } from '@/lib/money'

import { useCreateBill, useUpdateBill } from './api'
import { frequencyLabel } from './labels'

/**
 * Set up a bill that comes round again, or edit one.
 *
 * `bill === null` while open means create.
 *
 * **Only EQUAL and WEIGHT are offered.** `SplitEditor` is built around a known
 * total, and a bill whose amount varies has none -- there is nothing to hand it
 * to divide. Both of the splits here need no per-person amount, and leaving
 * `participants` out entirely lets the API fall back to every active member,
 * or to a standing split rule for the category. That is how "rent, monthly"
 * and "rent by room size" combine without this sheet knowing about either.
 */
export function BillEditorSheet({
  bill,
  open,
  onClose,
}: {
  bill: RecurringBill | null
  open: boolean
  onClose: () => void
}) {
  const t = useT()
  const { groupId, currency, activeMembers } = useGroupScope()
  const { user } = useAuth()
  const create = useCreateBill(groupId)
  const update = useUpdateBill(groupId)

  // Initialised straight from the bill rather than synced to it in an effect.
  // `RecurringScreen` mounts this sheet only while it is open and keys it by
  // bill, so "fresh state for a different bill" is a remount -- which is what
  // React gives you for free, and what an effect would only imitate badly.
  const [title, setTitle] = useState(bill?.title ?? '')
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(bill?.frequency ?? 'MONTHLY')
  const [dueOn, setDueOn] = useState(bill?.next_due_on ?? today())
  const [payerId, setPayerId] = useState(bill?.payer.id ?? user?.id ?? '')
  const [varies, setVaries] = useState(
    bill ? bill.amount === null || bill.amount === undefined : false,
  )
  const [amount, setAmount] = useState(bill?.amount != null ? String(bill.amount) : '')
  const [category, setCategory] = useState<ExpenseCategory | ''>(bill?.category ?? '')
  const [splitType, setSplitType] = useState<SplitType>(bill?.split_type ?? 'EQUAL')
  const [reminderDays, setReminderDays] = useState(String(bill?.reminder_days_before ?? 3))
  const [counted, setCounted] = useState(bill?.occurrences_total != null)
  const [count, setCount] = useState(
    bill?.occurrences_total != null ? String(bill.occurrences_total) : '12',
  )

  // The API refuses a first due date in the past, and it is right to: a
  // schedule nobody has seen yet should not conjure up months of back-dated
  // expenses on its first run. Caught here so it reads as a hint, not a 422.
  const duePast = bill === null && dueOn !== '' && dueOn < today()
  const amountValid = varies || (isValidAmount(amount) && isPositive(amount))
  // A whole number above zero, which is what the column's CHECK allows.
  const countValid = !counted || /^[1-9]\d*$/.test(count.trim())
  const valid = title.trim().length > 0 && payerId !== '' && amountValid && countValid && !duePast

  const pending = create.isPending || update.isPending
  const error = create.error ?? update.error

  function reset() {
    create.reset()
    update.reset()
    onClose()
  }

  function submit() {
    const shared = {
      title: title.trim(),
      payer_id: payerId,
      category: category === '' ? null : category,
      split_type: splitType,
      reminder_days_before: Number(reminderDays) || 0,
      occurrences_total: counted ? Number(count) : null,
    }

    if (bill) {
      update.mutate(
        {
          billId: bill.id,
          input: {
            ...shared,
            // `clear_amount` is how a fixed bill becomes a reminder-only one:
            // sending `amount: null` alone would read as "leave it alone".
            amount: varies ? null : amount,
            clear_amount: varies,
            // Same reason as `clear_amount`: without this, "back to forever"
            // and "leave the count alone" are the same request.
            clear_occurrences: !counted,
            next_due_on: dueOn,
          },
        },
        { onSuccess: reset },
      )
      return
    }

    create.mutate(
      {
        ...shared,
        frequency,
        first_due_on: dueOn,
        amount: varies ? null : amount,
      },
      { onSuccess: reset },
    )
  }

  return (
    <Sheet
      open={open}
      onClose={reset}
      title={bill ? t('recurring.editor.editTitle') : t('recurring.editor.newTitle')}
      description={t('recurring.editor.description')}
      footer={
        <>
          <Button variant="secondary" fullWidth onClick={reset}>
            {t('common.actions.cancel')}
          </Button>
          <Button fullWidth loading={pending} disabled={!valid} onClick={submit}>
            {t('recurring.editor.save')}
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        {error && (
          <p role="alert" className="bg-danger-soft text-danger rounded-sm px-3 py-2.5 text-sm">
            {detailOf(error)}
          </p>
        )}

        <Field
          label={t('recurring.editor.titleLabel')}
          required
          hint={t('recurring.editor.titleHint')}
        >
          {(props) => (
            <Input
              {...props}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              autoFocus
            />
          )}
        </Field>

        {bill === null && (
          <Field label={t('recurring.editor.frequencyLabel')}>
            {(props) => (
              <Select
                {...props}
                value={frequency}
                onChange={(event) => setFrequency(event.target.value as RecurrenceFrequency)}
              >
                {RECURRENCE_FREQUENCIES.map((option) => (
                  <option key={option} value={option}>
                    {frequencyLabel(t, option)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <Field
          label={bill ? t('recurring.editor.nextDueLabel') : t('recurring.editor.firstDueLabel')}
          required
          hint={bill ? undefined : t('recurring.editor.firstDueHint')}
          error={duePast ? t('recurring.editor.firstDuePast') : undefined}
        >
          {(props) => (
            <Input
              {...props}
              type="date"
              value={dueOn}
              onChange={(event) => setDueOn(event.target.value)}
            />
          )}
        </Field>

        <Field label={t('recurring.editor.payerLabel')} required>
          {(props) => (
            <Select {...props} value={payerId} onChange={(event) => setPayerId(event.target.value)}>
              {activeMembers.map((member) => (
                <option key={member.user.id} value={member.user.id}>
                  {member.user.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {/* The distinction the whole feature turns on, as one checkbox. */}
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={varies}
            onChange={(event) => setVaries(event.target.checked)}
            className="mt-0.5 size-4 shrink-0"
          />
          <span>
            <span className="font-semibold">{t('recurring.editor.variesLabel')}</span>
            <span className="text-muted block">{t('recurring.editor.variesHint')}</span>
          </span>
        </label>

        {!varies && (
          <Field label={t('recurring.editor.amountLabel')} required>
            {(props) => (
              <MoneyInput
                {...props}
                value={amount}
                onValueChange={setAmount}
                currencySymbol={currency === 'ILS' ? '₪' : ''}
              />
            )}
          </Field>
        )}

        <Field label={t('recurring.editor.categoryLabel')}>
          {(props) => (
            <Select
              {...props}
              value={category}
              onChange={(event) => setCategory(event.target.value as ExpenseCategory | '')}
            >
              <option value="">{t('recurring.editor.categoryNone')}</option>
              {EXPENSE_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {categoryLabel(t, option)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label={t('recurring.editor.splitLabel')} hint={t('recurring.editor.splitHint')}>
          {(props) => (
            <Select
              {...props}
              value={splitType}
              onChange={(event) => setSplitType(event.target.value as SplitType)}
            >
              {/* EQUAL and WEIGHT only -- see the note at the top. */}
              <option value="EQUAL">{splitTypeLabel(t, 'EQUAL')}</option>
              <option value="WEIGHT">{splitTypeLabel(t, 'WEIGHT')}</option>
            </Select>
          )}
        </Field>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={counted}
            onChange={(event) => setCounted(event.target.checked)}
            className="mt-0.5 size-4 shrink-0"
          />
          <span>
            <span className="font-semibold">{t('recurring.editor.countLabel')}</span>
            <span className="text-muted block">{t('recurring.editor.countHint')}</span>
          </span>
        </label>

        {counted && (
          <Field
            label={t('recurring.editor.countField')}
            required
            error={countValid ? undefined : t('recurring.editor.countError')}
          >
            {(props) => (
              <Input
                {...props}
                inputMode="numeric"
                value={count}
                onChange={(event) => setCount(event.target.value)}
              />
            )}
          </Field>
        )}

        <Field label={t('recurring.editor.reminderLabel')}>
          {(props) => (
            <Input
              {...props}
              inputMode="numeric"
              value={reminderDays}
              onChange={(event) => setReminderDays(event.target.value)}
            />
          )}
        </Field>
      </Stack>
    </Sheet>
  )
}
