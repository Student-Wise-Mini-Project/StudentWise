import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { detailOf } from '@/api/errors'
import type { ReceiptScan } from '@/api/types'
import { AppBar } from '@/app/layouts/AppBar'
import { Button, LinkButton } from '@/components/Button'
import { Spinner } from '@/components/Spinner'
import { ReceiptIcon } from '@/components/icons'
import { Page, Stack } from '@/components/layout'
import { useCreateExpense } from '@/features/expenses/api'
import { useGroupScope } from '@/features/groups/groupContext'
import { useT } from '@/i18n/i18nContext'
import { today } from '@/lib/dates'
import { createIdempotencyTracker } from '@/lib/idempotency'
import { shrinkImage } from '@/lib/image'

import { ReceiptCheckStep } from './ReceiptCheckStep'
import { ReceiptSplitStep } from './ReceiptSplitStep'
import { draftFromScan, toItems, wasEdited, type ReceiptDraft } from './receiptDraft'
import { useAttachReceipt, useScanReceipt } from './scanApi'

/**
 * Photo in, expense out, with a person checking every step.
 *
 *   pick a photo -> the server reads it -> check what was read
 *     -> say who had what -> save -> attach the photo
 *
 * Nothing is stored until Save. The scan itself is stateless on the server, so
 * abandoning this screen at any point leaves nothing behind.
 *
 * The photo is attached after the expense exists, in a second request -- the
 * receipt store names files after the expense they belong to. The expense is
 * the part that matters, so if only the photo fails the expense stays saved
 * and the screen says so, the same way a failed "repeats" schedule is handled
 * on the new-expense screen.
 */
export function ScanReceiptScreen() {
  const t = useT()
  const navigate = useNavigate()
  const { groupId, activeMembers, me, currency } = useGroupScope()

  const scanReceipt = useScanReceipt(groupId)
  const create = useCreateExpense(groupId)
  const attach = useAttachReceipt(groupId)
  const idempotency = useRef(createIdempotencyTracker())

  const [photo, showPhoto] = usePhoto()
  const [scan, setScan] = useState<ReceiptScan | null>(null)
  const [draft, setDraft] = useState<ReceiptDraft | null>(null)
  const [step, setStep] = useState<'check' | 'split'>('check')
  const [unattached, setUnattached] = useState<string | null>(null)
  const photoUrl = photo?.url ?? null

  const cameraInput = useRef<HTMLInputElement>(null)
  const libraryInput = useRef<HTMLInputElement>(null)

  const leave = () => navigate(`/groups/${groupId}`)
  const openExpense = (expenseId: string) =>
    navigate(`/groups/${groupId}/expenses/${expenseId}`, { replace: true })

  async function read(file: File) {
    const small = await shrinkImage(file)
    showPhoto(small)
    scanReceipt.mutate(small, {
      onSuccess: (result) => {
        setScan(result)
        setDraft(
          draftFromScan(result, {
            payerId: me?.user.id ?? '',
            today: today(),
            fallbackTitle: t('scan.defaultTitle'),
          }),
        )
        setStep('check')
      },
    })
  }

  function attachPhoto(expenseId: string) {
    if (!photo) {
      openExpense(expenseId)
      return
    }
    attach.mutate(
      { expenseId, file: photo.file },
      {
        onSuccess: () => openExpense(expenseId),
        onError: () => setUnattached(expenseId),
      },
    )
  }

  function save() {
    if (!draft || !scan) return
    const input = {
      title: draft.title.trim(),
      total_amount: draft.total,
      expense_date: draft.date,
      payer_id: draft.payerId,
      split_type: 'EXACT' as const,
      category: draft.category === '' ? null : draft.category,
      notes: null,
      source: 'OCR' as const,
      items: toItems(draft),
      ai_metadata: { ...scan.ai_metadata, edited: wasEdited(draft, scan) },
    }
    create.mutate(
      { input, idempotencyKey: idempotency.current.keyFor(input) },
      {
        onSuccess: (expense) => {
          idempotency.current.consume()
          attachPhoto(expense.id)
        },
      },
    )
  }

  if (unattached) {
    return (
      <>
        <AppBar variant="modal" title={t('scan.pick.title')} />
        <Page width="narrow" padded>
          <Stack gap={3} className="pt-6">
            <p role="alert" className="bg-warn-soft text-warn rounded-sm px-3 py-2.5 text-sm">
              {t('scan.attach.failed')}
            </p>
            <Button loading={attach.isPending} onClick={() => attachPhoto(unattached)}>
              {t('scan.attach.retry')}
            </Button>
            <Button variant="ghost" onClick={() => openExpense(unattached)}>
              {t('scan.attach.skip')}
            </Button>
          </Stack>
        </Page>
      </>
    )
  }

  if (draft && scan && step === 'check') {
    return (
      <ReceiptCheckStep
        draft={draft}
        onChange={setDraft}
        scan={scan}
        photoUrl={photoUrl}
        members={activeMembers}
        currency={currency}
        groupCurrency={currency}
        onNext={() => setStep('split')}
        onCancel={leave}
      />
    )
  }

  if (draft && scan && step === 'split') {
    return (
      <ReceiptSplitStep
        groupId={groupId}
        draft={draft}
        onChange={setDraft}
        members={activeMembers}
        currency={currency}
        saving={create.isPending || attach.isPending}
        error={create.error}
        onBack={() => setStep('check')}
        onSave={save}
      />
    )
  }

  const pickFrom = (input: HTMLInputElement | null) => input?.click()
  const onPicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Reset first, so choosing the same photo again still fires a change.
    event.target.value = ''
    if (file) void read(file)
  }

  return (
    <>
      <AppBar
        variant="modal"
        title={t('scan.pick.title')}
        leading={
          <Button variant="ghost" size="sm" onClick={leave}>
            {t('common.actions.cancel')}
          </Button>
        }
      />

      <Page width="narrow" padded>
        {scanReceipt.isPending ? (
          <Stack gap={3} className="items-center pt-6 text-center">
            {photoUrl && (
              <img
                src={photoUrl}
                alt={t('scan.photo.alt')}
                className="border-line max-h-72 rounded-sm border object-contain opacity-60"
              />
            )}
            <Spinner size="lg" label={t('scan.pick.reading')} />
            <p className="font-display text-lg font-bold">{t('scan.pick.reading')}</p>
            <p className="text-muted text-sm">{t('scan.pick.readingHint')}</p>
          </Stack>
        ) : (
          <Stack gap={3} className="pt-8 text-center">
            <ReceiptIcon className="text-faint mx-auto size-12" aria-hidden="true" />
            <h1 className="font-display text-2xl font-black tracking-tight">
              {t('scan.pick.heading')}
            </h1>
            <p className="text-muted text-sm">{t('scan.pick.body')}</p>

            {scanReceipt.isError && (
              <p role="alert" className="bg-danger-soft text-danger rounded-sm px-3 py-2.5 text-sm">
                {detailOf(scanReceipt.error)}
              </p>
            )}

            <Button size="lg" fullWidth onClick={() => pickFrom(cameraInput.current)}>
              {scanReceipt.isError ? t('scan.pick.tryAgain') : t('scan.pick.takePhoto')}
            </Button>
            <Button variant="secondary" fullWidth onClick={() => pickFrom(libraryInput.current)}>
              {t('scan.pick.choosePhoto')}
            </Button>
            <LinkButton to={`/groups/${groupId}/expenses/new`} variant="ghost" fullWidth>
              {t('scan.pick.typeInstead')}
            </LinkButton>
          </Stack>
        )}

        {/* `capture` opens the rear camera on a phone and is ignored on a
         * desktop, which gets a file picker either way. The second input has
         * no `capture`, for a photo that was taken earlier. */}
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onPicked}
          data-testid="receipt-camera-input"
        />
        <input
          ref={libraryInput}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onPicked}
          data-testid="receipt-library-input"
        />
      </Page>
    </>
  )
}

/**
 * The photo and an object URL to show it by.
 *
 * The URL is made where the file arrives rather than derived in an effect, and
 * the previous one is revoked as it is replaced. The unmount cleanup reads a
 * ref: StrictMode's rehearsal unmount happens at mount time, before any photo
 * exists, so it can never revoke a URL that is still on screen.
 */
function usePhoto() {
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null)
  const current = useRef<string | null>(null)

  useEffect(
    () => () => {
      if (current.current) URL.revokeObjectURL(current.current)
    },
    [],
  )

  const show = (file: File) => {
    if (current.current) URL.revokeObjectURL(current.current)
    const url = URL.createObjectURL(file)
    current.current = url
    setPhoto({ file, url })
  }

  return [photo, show] as const
}
