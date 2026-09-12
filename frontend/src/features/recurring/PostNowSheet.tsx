import { useState } from 'react'

import { detailOf, isApiError } from '@/api/errors'
import type { RecurringBill } from '@/api/types'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Input } from '@/components/Input'
import { MoneyInput } from '@/components/MoneyInput'
import { Stack } from '@/components/layout'
import { Sheet } from '@/components/Sheet'
import { useGroupScope } from '@/features/groups/groupContext'
import { useT } from '@/i18n/i18nContext'
import { isPositive, isValidAmount } from '@/lib/money'

import { useGenerateBill } from './api'

/**
 * Post one bill, now — how a varying bill gets recorded.
 *
 * The amount is required when the bill carries none of its own: the API
 * refuses without it, because inventing a number for the electricity would be
 * worse than asking. A bill that already has an amount defaults to it and
 * stays editable, since the rent does occasionally change.
 */
export function PostNowSheet({
  bill,
  onClose,
}: {
  bill: RecurringBill | null
  onClose: () => void
}) {
  const t = useT()
  const { groupId, currency } = useGroupScope()
  const generate = useGenerateBill(groupId)

  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')

  const value = amount === '' ? (bill?.amount ?? '') : amount
  const valid = isValidAmount(value) && isPositive(value)

  function reset() {
    setAmount('')
    setDate('')
    generate.reset()
    onClose()
  }

  // Posting the same bill twice for one date is refused by a unique index, and
  // it is a thing people will do. A raw "conflict" helps nobody.
  const alreadyPosted = isApiError(generate.error) && generate.error.status === 409

  return (
    <Sheet
      open={bill !== null}
      onClose={reset}
      title={bill ? t('recurring.post.title', { title: bill.title }) : t('recurring.postNow')}
      description={t('recurring.post.description')}
      footer={
        <>
          <Button variant="secondary" fullWidth onClick={reset}>
            {t('common.actions.cancel')}
          </Button>
          <Button
            fullWidth
            loading={generate.isPending}
            disabled={!valid}
            onClick={() =>
              bill &&
              generate.mutate(
                { billId: bill.id, amount: value, expense_date: date === '' ? null : date },
                { onSuccess: reset },
              )
            }
          >
            {t('recurring.post.submit')}
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        {generate.isError && (
          <p role="alert" className="bg-danger-soft text-danger rounded-sm px-3 py-2.5 text-sm">
            {alreadyPosted ? t('recurring.post.alreadyPosted') : detailOf(generate.error)}
          </p>
        )}

        <Field label={t('recurring.post.amountLabel')} required>
          {(props) => (
            <MoneyInput
              {...props}
              value={value}
              onValueChange={setAmount}
              currencySymbol={currency === 'ILS' ? '₪' : ''}
            />
          )}
        </Field>

        <Field label={t('recurring.post.dateLabel')}>
          {(props) => (
            <Input
              {...props}
              type="date"
              value={date === '' ? (bill?.next_due_on ?? '') : date}
              onChange={(event) => setDate(event.target.value)}
            />
          )}
        </Field>
      </Stack>
    </Sheet>
  )
}
