import { useState } from 'react'

import { EXPENSE_CATEGORIES, type GroupMember, type ReceiptScan } from '@/api/types'
import { AppBar } from '@/app/layouts/AppBar'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { ListSection } from '@/components/ListRow'
import { Money } from '@/components/Money'
import { MoneyInput } from '@/components/MoneyInput'
import { Sheet } from '@/components/Sheet'
import { CheckIcon } from '@/components/icons'
import { Page } from '@/components/layout'
import { LabelRow } from '@/features/expenses/ExpenseEditorScreen'
import { useT } from '@/i18n/i18nContext'
import { cn } from '@/lib/cn'
import { categoryLabel } from '@/lib/labels'
import { compare } from '@/lib/money'

import { gap, linesTotal, newLineKey, problems, type ReceiptDraft } from './receiptDraft'

/**
 * Step one: fix what the camera got wrong.
 *
 * Laid out like the receipt it came from -- the total first and largest, then
 * the lines in the order they were printed -- so checking it is reading down
 * two columns side by side, not hunting through a form.
 */
export function ReceiptCheckStep({
  draft,
  onChange,
  scan,
  photoUrl,
  members,
  currency,
  groupCurrency,
  onNext,
  onCancel,
}: {
  draft: ReceiptDraft
  onChange: (next: ReceiptDraft) => void
  scan: ReceiptScan
  photoUrl: string | null
  members: GroupMember[]
  currency: string
  groupCurrency: string
  onNext: () => void
  onCancel: () => void
}) {
  const t = useT()
  const [photoOpen, setPhotoOpen] = useState(false)
  const [payerSheetOpen, setPayerSheetOpen] = useState(false)

  const patch = (next: Partial<ReceiptDraft>) => onChange({ ...draft, ...next })
  const patchLine = (index: number, next: Partial<ReceiptDraft['lines'][number]>) =>
    patch({ lines: draft.lines.map((line, i) => (i === index ? { ...line, ...next } : line)) })

  const payer = members.find((member) => member.user.id === draft.payerId)
  const remaining = problems(draft)
  const difference = gap(draft)

  return (
    <>
      <AppBar
        variant="modal"
        title={t('scan.check.title')}
        leading={
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t('common.actions.cancel')}
          </Button>
        }
      />

      <Page width="narrow">
        <div className="flex flex-col gap-2 px-4 pt-3">
          {scan.warnings.map((warning) => (
            <p
              key={warning}
              role="status"
              className="bg-warn-soft text-warn rounded-sm px-3 py-2.5 text-sm"
              dir="auto"
            >
              {t(`scan.warnings.${warning}`, {
                currency: scan.currency ?? '',
                groupCurrency,
              })}
            </p>
          ))}
          <p className="text-muted text-sm">{t('scan.check.hint')}</p>
        </div>

        {photoUrl && (
          <div className="px-4 pt-3">
            <button
              type="button"
              aria-expanded={photoOpen}
              onClick={() => setPhotoOpen((open) => !open)}
              className="text-accent font-display text-sm font-bold"
            >
              {photoOpen ? t('scan.photo.hide') : t('scan.photo.show')}
            </button>
            {photoOpen && (
              <img
                src={photoUrl}
                alt={t('scan.photo.alt')}
                className="border-line mt-2 max-h-[60dvh] w-full rounded-sm border object-contain"
              />
            )}
          </div>
        )}

        <div className="px-4 pt-4 pb-4 text-center">
          <MoneyInput
            size="hero"
            value={draft.total}
            onValueChange={(total) => patch({ total })}
            currencySymbol={currency === 'ILS' ? '₪' : currency}
            aria-label={t('scan.check.totalAria')}
            placeholder="0.00"
            className="w-40 text-center"
          />
        </div>

        <div className="bg-surface border-line divide-line divide-y border-y">
          <LabelRow label={t('expenses.editor.what')}>
            <input
              value={draft.title}
              onChange={(event) => patch({ title: event.target.value })}
              maxLength={200}
              aria-label={t('expenses.editor.whatAria')}
              dir="auto"
              className="text-control w-full border-0 bg-transparent font-semibold outline-none"
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
              value={draft.date}
              onChange={(event) => patch({ date: event.target.value })}
              aria-label={t('expenses.editor.whenAria')}
              className="tnum text-control w-full border-0 bg-transparent font-semibold outline-none"
            />
          </LabelRow>

          <div className="px-4 py-3">
            <span
              id="scan-category-label"
              className="text-muted font-display text-2xs block font-extrabold tracking-[0.08em] uppercase"
            >
              {t('expenses.editor.category')}
            </span>
            <div
              role="group"
              aria-labelledby="scan-category-label"
              className="mt-2.5 flex flex-wrap gap-2"
            >
              {EXPENSE_CATEGORIES.map((category) => {
                const on = draft.category === category
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

        <ListSection header={t('scan.check.linesHeader')} className="pt-2">
          {draft.lines.map((line, index) => {
            const n = index + 1
            return (
              <div key={line.key} className="flex items-center gap-2 px-4 py-2">
                <input
                  value={line.name}
                  onChange={(event) => patchLine(index, { name: event.target.value })}
                  maxLength={200}
                  aria-label={t('scan.check.lineNameAria', { n })}
                  dir="auto"
                  className="text-control min-w-0 flex-1 border-0 bg-transparent outline-none"
                />
                <MoneyInput
                  value={line.amount}
                  onValueChange={(amount) => patchLine(index, { amount })}
                  currencySymbol={currency === 'ILS' ? '₪' : currency}
                  aria-label={t('scan.check.lineAmountAria', { n })}
                  className="w-28"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('scan.check.removeLine', { n })}
                  onClick={() => patch({ lines: draft.lines.filter((_, i) => i !== index) })}
                >
                  ×
                </Button>
              </div>
            )
          })}
          <div className="px-4 py-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                patch({
                  lines: [...draft.lines, { key: newLineKey(), name: '', amount: '', userIds: [] }],
                })
              }
            >
              {t('scan.check.addLine')}
            </Button>
          </div>
        </ListSection>

        <dl className="flex flex-col gap-1.5 px-4 pt-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{t('scan.check.linesTotal')}</dt>
            <dd>
              <Money amount={linesTotal(draft)} currency={currency} size="sm" />
            </dd>
          </div>
          {difference !== null && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">
                {compare(difference, '0') < 0
                  ? t('scan.check.gapDiscount')
                  : compare(difference, '0') > 0
                    ? t('scan.check.gapExtra')
                    : t('scan.check.gapNone')}
              </dt>
              {compare(difference, '0') !== 0 && (
                <dd>
                  <Money amount={difference} currency={currency} size="sm" sign="always" />
                </dd>
              )}
            </div>
          )}
        </dl>

        <div className="px-4 pt-6">
          <Button fullWidth size="lg" disabled={remaining.length > 0} onClick={onNext}>
            {t('scan.check.next')}
          </Button>
          {remaining[0] && (
            <p role="status" className="text-danger mt-2 text-sm">
              {t(`scan.problems.${remaining[0]}`)}
            </p>
          )}
        </div>
      </Page>

      <Sheet
        open={payerSheetOpen}
        onClose={() => setPayerSheetOpen(false)}
        title={t('expenses.editor.whoPaid')}
        className="sm:max-w-sm"
      >
        <div className="divide-line -my-1 divide-y">
          {members.map((member) => (
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
              {member.user.id === draft.payerId && (
                <CheckIcon className="text-accent size-5 shrink-0" />
              )}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  )
}
