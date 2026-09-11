import { useRef } from 'react'

import { detailOf } from '@/api/errors'
import { Button } from '@/components/Button'
import { Spinner } from '@/components/Spinner'
import { Stack } from '@/components/layout'

import { useDeleteReceipt, useReceiptBlob, useUploadReceipt } from './api'

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
  const receipt = useReceiptBlob(expenseId, hasReceipt)
  const upload = useUploadReceipt(groupId, expenseId)
  const remove = useDeleteReceipt(groupId, expenseId)
  const fileInput = useRef<HTMLInputElement>(null)

  const tooBig =
    upload.variables instanceof File && upload.variables.size > MAX_BYTES && upload.isError

  return (
    <section className="flex flex-col gap-3 px-4">
      <h2 className="text-muted text-xs font-semibold tracking-wide uppercase">Receipt</h2>

      {receipt.status === 'loading' && (
        <div className="bg-sunken flex h-40 items-center justify-center rounded-xl">
          <Spinner label="Loading the receipt" />
        </div>
      )}

      {receipt.status === 'ready' && (
        <img
          src={receipt.url}
          alt="The receipt for this expense"
          className="border-line max-h-96 w-full rounded-xl border object-contain"
        />
      )}

      {receipt.status === 'error' && (
        <p className="text-danger text-sm">{detailOf(receipt.error, 'Could not load it.')}</p>
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
          {receipt.status === 'ready' ? 'Replace photo' : 'Add a photo'}
        </Button>
        {receipt.status === 'ready' && (
          <Button
            variant="ghost"
            size="sm"
            loading={remove.isPending}
            onClick={() => remove.mutate()}
          >
            Remove
          </Button>
        )}
      </Stack>

      {upload.isError && (
        <p role="alert" className="text-danger text-sm">
          {tooBig ? 'That photo is over 5 MB.' : detailOf(upload.error)}
        </p>
      )}

      <p className="text-muted text-xs">
        JPEG, PNG or WebP, up to 5&nbsp;MB. The server checks the actual bytes rather than trusting
        the file name, and only members of this group can see it.
      </p>
    </section>
  )
}
