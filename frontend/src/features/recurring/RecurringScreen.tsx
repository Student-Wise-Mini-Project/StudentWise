import { useState } from 'react'

import { detailOf } from '@/api/errors'
import type { RecurringBill } from '@/api/types'
import { Button } from '@/components/Button'
import { ListRow, ListSection } from '@/components/ListRow'
import { Money } from '@/components/Money'
import { Sheet } from '@/components/Sheet'
import { EmptyState, ErrorState, ListRowSkeleton } from '@/components/feedback'
import { Stack } from '@/components/layout'
import { useGroupScope } from '@/features/groups/groupContext'
import { useT } from '@/i18n/i18nContext'
import { formatDay, today } from '@/lib/dates'

import { BillEditorSheet } from './BillEditorSheet'
import { PostNowSheet } from './PostNowSheet'
import { frequencyLabel } from './labels'
import { useDeleteBill, useRecurringBills, useUpdateBill } from './api'

/**
 * The bills that come round again.
 *
 * One distinction carries the screen, and it is the backend's own: a bill with
 * an amount **posts itself**, and a bill without one **waits for somebody to
 * read the meter**. Rent is 3600 every month; the electricity is whatever it
 * is. A list that showed those two the same way would be a list that invents
 * an electricity bill.
 *
 * Nothing here re-sorts: the API sends them soonest-due first, and two sort
 * orders for one list is how a screen ends up disagreeing with its own API.
 */
export function RecurringScreen() {
  const t = useT()
  const { groupId, currency, isOpen } = useGroupScope()
  const bills = useRecurringBills(groupId)
  const update = useUpdateBill(groupId)

  const [editing, setEditing] = useState<RecurringBill | null>(null)
  const [creating, setCreating] = useState(false)
  const [posting, setPosting] = useState<RecurringBill | null>(null)
  const [deleting, setDeleting] = useState<RecurringBill | null>(null)

  if (bills.isLoading) return <ListRowSkeleton count={3} />
  if (bills.isError) {
    return <ErrorState error={bills.error} onRetry={() => void bills.refetch()} />
  }

  const rows = bills.data ?? []

  return (
    <>
      {rows.length === 0 ? (
        <EmptyState
          title={t('recurring.emptyTitle')}
          body={t('recurring.emptyBody')}
          action={
            isOpen
              ? { label: t('recurring.emptyAction'), onClick: () => setCreating(true) }
              : undefined
          }
        />
      ) : (
        <ListSection
          header={t('recurring.title')}
          action={
            isOpen ? (
              <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
                {t('recurring.add')}
              </Button>
            ) : undefined
          }
        >
          {rows.map((bill) => (
            <ListRow
              key={bill.id}
              title={bill.title}
              subtitle={
                <>
                  {frequencyLabel(t, bill.frequency)}
                  {' · '}
                  {bill.is_finished ? (
                    // Spent, not paused. It stays in the list so the number can
                    // be raised to extend it, or it can be deleted on purpose.
                    t('recurring.finished')
                  ) : !bill.active ? (
                    t('recurring.paused')
                  ) : bill.next_due_on <= today() ? (
                    // A bill that has already come due and is still sitting
                    // here is one `run` could not post on its own -- which for
                    // a varying bill means it is waiting on a person. This is
                    // what gives RunResult.awaiting_amount somewhere to land;
                    // "Next 1 Oct" on a bill that was due in March says the
                    // opposite of what is true.
                    <span className="text-debt font-semibold">{t('recurring.dueNow')}</span>
                  ) : (
                    t('recurring.nextDue', { date: formatDay(bill.next_due_on) })
                  )}
                </>
              }
              meta={
                bill.amount === null || bill.amount === undefined ? (
                  // The word, not a number. Guessing what the electricity cost
                  // would be worse than saying plainly that nobody knows yet.
                  <span className="text-muted font-display text-sm font-bold">
                    {t('recurring.varies')}
                  </span>
                ) : (
                  <Money amount={bill.amount} currency={currency} size="lg" />
                )
              }
              metaSubtitle={
                bill.occurrences_total === null || bill.occurrences_total === undefined
                  ? undefined
                  : t('recurring.counted', {
                      done: bill.occurrences_done,
                      total: bill.occurrences_total,
                    })
              }
              trailing={
                isOpen ? (
                  <Stack direction="row" gap={1}>
                    {!bill.is_finished && (
                      <Button size="sm" variant="secondary" onClick={() => setPosting(bill)}>
                        {t('recurring.postNow')}
                      </Button>
                    )}
                    {!bill.is_finished && (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={update.isPending && update.variables?.billId === bill.id}
                        onClick={() =>
                          update.mutate({
                            billId: bill.id,
                            // `clear_amount` is sent explicitly: the generated
                            // types mark every server-defaulted field required,
                            // and sending `true` here by omission would wipe a
                            // fixed bill's amount just for a pause.
                            input: {
                              active: !bill.active,
                              clear_amount: false,
                              clear_occurrences: false,
                            },
                          })
                        }
                      >
                        {bill.active ? t('recurring.pause') : t('recurring.resume')}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setEditing(bill)}>
                      {t('common.actions.edit')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(bill)}>
                      {t('common.actions.delete')}
                    </Button>
                  </Stack>
                ) : undefined
              }
            />
          ))}
        </ListSection>
      )}

      {update.isError && (
        <p role="alert" className="text-danger px-4 py-2 text-sm">
          {detailOf(update.error)}
        </p>
      )}

      {/* Mounted only while open, and keyed by bill: opening the editor on a
       * different bill is a remount, so its fields start from that bill rather
       * than from whatever was typed last. */}
      {(creating || editing !== null) && (
        <BillEditorSheet
          key={editing?.id ?? 'new'}
          bill={editing}
          open
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
        />
      )}
      <PostNowSheet bill={posting} onClose={() => setPosting(null)} />
      <DeleteBillSheet bill={deleting} onClose={() => setDeleting(null)} />
    </>
  )
}

function DeleteBillSheet({ bill, onClose }: { bill: RecurringBill | null; onClose: () => void }) {
  const t = useT()
  const { groupId } = useGroupScope()
  const remove = useDeleteBill(groupId)

  return (
    <Sheet
      open={bill !== null}
      onClose={onClose}
      title={t('recurring.delete.title')}
      description={t('recurring.delete.body')}
      footer={
        <>
          <Button variant="secondary" fullWidth onClick={onClose}>
            {t('common.actions.cancel')}
          </Button>
          <Button
            variant="danger"
            fullWidth
            loading={remove.isPending}
            onClick={() => bill && remove.mutate(bill.id, { onSuccess: onClose })}
          >
            {t('recurring.delete.submit')}
          </Button>
        </>
      }
    >
      {remove.isError ? (
        <p role="alert" className="bg-danger-soft text-danger rounded-sm px-3 py-2.5 text-sm">
          {detailOf(remove.error)}
        </p>
      ) : (
        <p className="text-muted text-sm">{bill?.title}</p>
      )}
    </Sheet>
  )
}
