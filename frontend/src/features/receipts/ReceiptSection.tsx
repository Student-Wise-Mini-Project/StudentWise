import { useRef } from 'react'

import { detailOf } from '@/api/errors'
import { Button } from '@/components/Button'
import { Spinner } from '@/components/Spinner'
import { Stack } from '@/components/layout'

import { useDeleteReceipt, useReceiptBlob, useUploadReceipt } from './api'
import { useT } from '@/i18n/i18nContext'

/** What the API accepts. Anything else is a 400, so say so before the upload. */
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024

export function ReceiptSection({
  groupId,
  expenseId,
  hasReceipt,
}: {
  groupId: string
  expenseId: string
  hasReceipt: boolean
}) {
  const t = useT()
  const receipt = useReceiptBlob(expenseId, hasReceipt)
  const upload = useUploadReceipt(groupId, expenseId)
  const remove = useDeleteReceipt(groupId, expenseId)
  const fileInput = useRef<HTMLInputElement>(null)

  const tooBig =
    upload.variables instanceof File && upload.variables.size > MAX_BYTES && upload.isError

  return (
    <section className="flex flex-col gap-3 px-4">
      <h2 className="text-muted font-display text-2xs font-extrabold tracking-widest uppercase">
        {t('expenses.receipts.header')}
      </h2>

      {receipt.status === 'loading' && (
        <div className="bg-sunken flex h-40 items-center justify-center rounded-sm">
          <Spinner label={t('expenses.receipts.loading')} />
        </div>
      )}

      {receipt.status === 'ready' && (
        <img
          src={receipt.url}
          alt={t('expenses.receipts.alt')}
          className="border-line max-h-96 w-full rounded-sm border object-contain"
        />
      )}

      {receipt.status === 'error' && (
        <p className="text-danger text-sm">
          {detailOf(receipt.error, t('expenses.receipts.loadError'))}
        </p>
      )}

      {receipt.status === 'none' && (
        <p className="text-muted text-sm">
          No photo yet. A picture of the receipt settles most arguments before they start.
        </p>
      )}

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED.join(',')}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          // Reset first, so picking the same file twice still fires a change.
          event.target.value = ''
          if (file) upload.mutate(file)
        }}
      />

      <Stack direction="row" gap={2}>
        <Button
          variant="secondary"
          size="sm"
          loading={upload.isPending}
          onClick={() => fileInput.current?.click()}
        >
          {receipt.status === 'ready' ? t('expenses.receipts.replace') : t('expenses.receipts.add')}
        </Button>
        {receipt.status === 'ready' && (
          <Button
            variant="ghost"
            size="sm"
            loading={remove.isPending}
            onClick={() => remove.mutate()}
          >
            {t('common.actions.remove')}
          </Button>
        )}
      </Stack>

      {upload.isError && (
        <p role="alert" className="text-danger text-sm">
          {tooBig ? t('expenses.receipts.tooBig') : detailOf(upload.error)}
        </p>
      )}

      <p className="text-muted text-xs">{t('expenses.receipts.formatNote')}</p>
    </section>
  )
}
