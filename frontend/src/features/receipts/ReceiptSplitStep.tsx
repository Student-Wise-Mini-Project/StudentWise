import { useEffect, useMemo, useState } from 'react'

import { detailOf } from '@/api/errors'
import type { GroupMember } from '@/api/types'
import { AppBar } from '@/app/layouts/AppBar'
import { Avatar, AvatarStack } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { ListRow, ListSection } from '@/components/ListRow'
import { Money } from '@/components/Money'
import { Sheet } from '@/components/Sheet'
import { Spinner } from '@/components/Spinner'
import { CheckIcon } from '@/components/icons'
import { Page } from '@/components/layout'
import { useT } from '@/i18n/i18nContext'
import { cn } from '@/lib/cn'
import { abs, compare, formatMoney } from '@/lib/money'

import { toItems, toggleUser, type ReceiptDraft } from './receiptDraft'
import { useItemPreview } from './scanApi'

/**
 * Step two: who had what.
 *
 * A person's chip is a brush. Pick one, and every line tapped after that gets
 * that person's avatar -- their own colour and initial, the same as everywhere
 * else in the app, so "Maya's lines" can be seen at a glance and still read
 * correctly by someone who cannot tell the colours apart. A line nobody has
 * been put on is shared by everyone, which is what most lines on a shared shop
 * are, so the common case costs no taps at all.
 *
 * With no brush picked, tapping a line opens a list of names instead: slower,
 * but exact, and the path a screen reader takes.
 */
export function ReceiptSplitStep({
  groupId,
  draft,
  onChange,
  members,
  currency,
  saving,
  error,
  onBack,
  onSave,
}: {
  groupId: string
  draft: ReceiptDraft
  onChange: (next: ReceiptDraft) => void
  members: GroupMember[]
  currency: string
  saving: boolean
  error: unknown
  onBack: () => void
  onSave: () => void
}) {
  const t = useT()
  const [brush, setBrush] = useState<string | null>(null)
  const [sheetLine, setSheetLine] = useState<number | null>(null)

  const byId = useMemo(
    () => new Map(members.map((member) => [member.user.id, member.user])),
    [members],
  )

  const body = useMemo(() => ({ total_amount: draft.total, items: toItems(draft) }), [draft])
  const preview = useItemPreview(groupId, useDebounced(body, 300))
  const owed = new Map(preview.data?.splits.map((split) => [split.user_id, split.owed_amount]))
  const adjustment = preview.data?.adjustment

  const setLine = (
    index: number,
    update: (line: ReceiptDraft['lines'][number]) => ReceiptDraft['lines'][number],
  ) =>
    onChange({ ...draft, lines: draft.lines.map((line, i) => (i === index ? update(line) : line)) })

  const sheet = sheetLine === null ? null : draft.lines[sheetLine]

  return (
    <>
      <AppBar
        variant="modal"
        title={t('scan.split.title')}
        leading={
          <Button variant="ghost" size="sm" onClick={onBack}>
            {t('scan.split.back')}
          </Button>
        }
      />

      <Page width="narrow">
        <p className="text-muted px-4 pt-3 text-sm">{t('scan.split.hint')}</p>

        <div
          role="group"
          aria-label={t('scan.split.title')}
          className="flex flex-wrap gap-2 px-4 pt-3"
        >
          {members.map((member) => {
            const on = brush === member.user.id
            return (
              <button
                key={member.user.id}
                type="button"
                aria-pressed={on}
                onClick={() => setBrush(on ? null : member.user.id)}
                className={cn(
                  'font-display flex h-9 items-center gap-2 rounded-sm border ps-1 pe-3 text-sm font-bold transition-colors',
                  on
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line text-muted hover:text-ink',
                )}
              >
                <Avatar user={member.user} size="xs" />
                {member.user.name}
              </button>
            )
          })}
        </div>
        {brush === null && (
          <p className="text-faint px-4 pt-2 text-xs">{t('scan.split.noBrushHint')}</p>
        )}

        <ListSection className="pt-2">
          {draft.lines.map((line, index) => {
            const people = line.userIds.flatMap((id) => byId.get(id) ?? [])
            const painted = brush !== null && line.userIds.includes(brush)
            return (
              <button
                key={line.key}
                type="button"
                onClick={() =>
                  brush === null
                    ? setSheetLine(index)
                    : setLine(index, (current) => toggleUser(current, brush))
                }
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-3 text-start transition-colors',
                  painted ? 'bg-accent-soft' : 'hover:bg-sunken',
                )}
              >
                <span className="min-w-0 flex-1">
                  {/* `bdi`, not `dir="auto"` on the block: the name keeps its
                   * own direction but sits where the page's text starts, so
                   * it lines up with the "Everyone" under it in either
                   * language. */}
                  <span className="block truncate text-base font-semibold">
                    <bdi>{line.name}</bdi>
                  </span>
                  <span className="mt-1 flex items-center">
                    {people.length > 0 ? (
                      <AvatarStack users={people} size="sm" max={6} />
                    ) : (
                      <span className="text-muted text-xs">{t('scan.split.everyone')}</span>
                    )}
                  </span>
                </span>
                <Money amount={line.amount} currency={currency} size="md" />
              </button>
            )
          })}
        </ListSection>

        <ListSection
          header={t('scan.split.perPerson')}
          action={
            preview.isFetching ? <Spinner size="sm" label={t('scan.split.previewLoading')} /> : null
          }
          className="pt-2"
        >
          {members.map((member) => {
            const amount = owed.get(member.user.id)
            return (
              <ListRow
                key={member.user.id}
                dense
                leading={<Avatar user={member.user} size="sm" />}
                title={member.user.name}
                // The server's own allocation, to the cent. No "≈": nothing on
                // this screen divides money.
                meta={
                  amount ? (
                    <Money amount={amount} currency={currency} size="lg" />
                  ) : (
                    <span className="text-faint">—</span>
                  )
                }
              />
            )
          })}
        </ListSection>

        {adjustment && compare(adjustment, '0') !== 0 && (
          <p className="text-muted px-4 pt-2 text-xs">
            {compare(adjustment, '0') < 0
              ? t('scan.split.adjustmentDiscount', {
                  amount: formatMoney(abs(adjustment), currency),
                })
              : t('scan.split.adjustmentExtra', { amount: formatMoney(adjustment, currency) })}
          </p>
        )}
        {preview.isError && (
          <p role="alert" className="text-danger px-4 pt-2 text-sm">
            {t('scan.split.previewError')} {detailOf(preview.error)}
          </p>
        )}

        {Boolean(error) && (
          <p
            role="alert"
            className="bg-danger-soft text-danger mx-4 mt-4 rounded-sm px-3 py-2.5 text-sm"
            dir="auto"
          >
            {detailOf(error)}
          </p>
        )}

        <div className="px-4 pt-6">
          <Button fullWidth size="lg" loading={saving} onClick={onSave}>
            {t('scan.split.save')}
          </Button>
        </div>
      </Page>

      <Sheet
        open={sheet !== null}
        onClose={() => setSheetLine(null)}
        title={t('scan.split.lineSheetTitle', { name: sheet?.name ?? '' })}
        description={t('scan.split.lineSheetHint')}
        className="sm:max-w-sm"
        footer={
          <>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                if (sheetLine !== null) setLine(sheetLine, (line) => ({ ...line, userIds: [] }))
              }}
            >
              {t('scan.split.setEveryone')}
            </Button>
            <Button fullWidth onClick={() => setSheetLine(null)}>
              {t('scan.split.done')}
            </Button>
          </>
        }
      >
        <div className="divide-line -my-1 divide-y">
          {members.map((member) => {
            const on = sheet?.userIds.includes(member.user.id) ?? false
            return (
              <button
                key={member.user.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => {
                  if (sheetLine !== null)
                    setLine(sheetLine, (line) => toggleUser(line, member.user.id))
                }}
                className="flex w-full items-center gap-3 py-2.5 text-start"
              >
                <Avatar user={member.user} size="sm" />
                <span className="flex-1 truncate text-base font-semibold">{member.user.name}</span>
                {on && <CheckIcon className="text-accent size-5 shrink-0" />}
              </button>
            )
          })}
        </div>
      </Sheet>
    </>
  )
}

/** The value, once it has stopped changing for `delay` ms. */
function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return settled
}
