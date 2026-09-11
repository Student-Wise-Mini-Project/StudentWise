import { useState } from 'react'

import { Badge } from '@/components/Badge'
import { Card } from '@/components/Card'
import { ListRow } from '@/components/ListRow'
import { Money } from '@/components/Money'
import { SegmentedControl } from '@/components/SegmentedControl'
import { DonutChart, PairedBars, TrendChart } from '@/components/charts'
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback'
import { ReceiptIcon } from '@/components/icons'
import { Stack } from '@/components/layout'
import { useAuth } from '@/features/auth/authContext'
import { useGroupScope } from '@/features/groups/groupContext'
import { formatDay, formatMonth } from '@/lib/dates'
import { categoryLabelOf } from '@/lib/labels'
import { formatMoney } from '@/lib/money'

import { useByCategory, useByMember, useByMonth, useSummary } from './api'

type Scope = 'group' | 'me'

/**
 * What this group spends, and on what.
 *
 * The scope switch is not cosmetic: it changes what the numbers *mean*. "Whole
 * group" is the sum of expense totals; "just me" is the sum of my shares. The
 * API distinguishes them and so does this screen, because "we spent ₪5,303" and
 * "I consumed ₪1,776" are different sentences and confusing them is how someone
 * concludes they are being overcharged.
 */
export function InsightsScreen() {
  const { groupId, currency } = useGroupScope()
  const { user } = useAuth()
  const [scope, setScope] = useState<Scope>('group')

  const userId = scope === 'me' ? user?.id : undefined
  const summary = useSummary(groupId, { userId })
  const byCategory = useByCategory(groupId, { userId })
  const byMonth = useByMonth(groupId, { userId })
  const byMember = useByMember(groupId)

  const loading = summary.isLoading || byCategory.isLoading || byMonth.isLoading
  const error = summary.error ?? byCategory.error ?? byMonth.error

  if (error) {
    return (
      <ErrorState
        error={error}
        onRetry={() => {
          void summary.refetch()
          void byCategory.refetch()
          void byMonth.refetch()
        }}
      />
    )
  }

  const nothingYet = !loading && summary.data?.expense_count === 0

  return (
    <Stack gap={5} className="py-4">
      <div className="px-4">
        <SegmentedControl
          name="Whose spending"
          value={scope}
          onChange={setScope}
          segments={[
            { value: 'group', label: 'Whole group' },
            { value: 'me', label: 'Just me' },
          ]}
        />
        <p className="text-muted mt-2 text-xs">
          {scope === 'group'
            ? 'What the group spent in total, whoever paid.'
            : 'Your share of each expense — what you actually used, not what you paid out.'}
        </p>
      </div>

      {loading && <LoadingBlocks />}

      {nothingYet && (
        <EmptyState
          icon={<ReceiptIcon className="size-10" />}
          title="Nothing to chart yet"
          body="Add a few expenses and this fills in."
          size="inline"
        />
      )}

      {!loading && !nothingYet && summary.data && (
        <>
          <Card className="mx-4">
            <Stack gap={3}>
              <Stack gap={1} className="items-center text-center">
                <p className="text-muted text-xs font-semibold tracking-wide uppercase">
                  {scope === 'group' ? 'Total spent' : 'Your share'}
                </p>
                <Money amount={summary.data.total_spent} currency={currency} size="display" />
                <p className="text-muted text-xs">
                  {/* The count is the number of expenses touched, not a number of
                      shares -- it does not change between scopes, so the wording
                      has to make clear it is not "18 of your expenses". */}
                  {scope === 'group' ? '' : 'across '}
                  {summary.data.expense_count}{' '}
                  {summary.data.expense_count === 1 ? 'expense' : 'expenses'}
                  {summary.data.first_expense_date &&
                    ` · since ${formatDay(summary.data.first_expense_date, 'short')}`}
                </p>
              </Stack>

              <div className="border-line grid grid-cols-2 gap-3 border-t pt-3">
                <Stat label="Average" value={summary.data.average_expense} currency={currency} />
                <Stat
                  label="Biggest"
                  value={summary.data.largest_expense?.total_amount ?? '0.00'}
                  currency={currency}
                  caption={summary.data.largest_expense?.title ?? undefined}
                />
              </div>
            </Stack>
          </Card>

          {byCategory.data && byCategory.data.categories.length > 0 && (
            <Section title="Where it goes">
              <Card>
                <DonutChart
                  totalLabel="Total"
                  total={formatMoney(byCategory.data.total, currency)}
                  slices={byCategory.data.categories
                    // A zero slice has no arc to draw and would render a
                    // degenerate path rather than nothing.
                    .filter((slice) => Number(slice.share_percent) > 0)
                    .map((slice) => ({
                      key: slice.category ?? 'OTHER',
                      label: categoryLabelOf(slice.category),
                      share: Number(slice.share_percent),
                      amount: formatMoney(slice.total, currency),
                      caption: `${slice.share_percent}%`,
                    }))}
                />
              </Card>
            </Section>
          )}

          {byMonth.data && byMonth.data.months.length > 0 && (
            <Section title="Month by month">
              <Card>
                <TrendChart
                  points={byMonth.data.months.map((point) => ({
                    key: point.month,
                    label: formatMonth(point.month),
                    value: Number(point.total),
                    amount: formatMoney(point.total, currency),
                  }))}
                  peakLabel={peakOf(byMonth.data.months, currency)}
                />
              </Card>
              <p className="text-muted px-1 text-xs">
                Empty months are shown as zero rather than skipped, so a gap reads as a gap.
              </p>
            </Section>
          )}

          {byMember.data && byMember.data.members.length > 0 && (
            <Section title="Who pays, who uses">
              <Card>
                <PairedBars
                  aName="Paid out"
                  bName="Used up"
                  rows={byMember.data.members.map((member) => ({
                    key: member.user.id,
                    label:
                      member.user.id === user?.id ? `${member.user.name} (you)` : member.user.name,
                    a: Number(member.paid),
                    b: Number(member.consumed),
                    aLabel: formatMoney(member.paid, currency),
                    bLabel: formatMoney(member.consumed, currency),
                  }))}
                />
              </Card>
              <p className="text-muted px-1 text-xs">
                This is spending, not debt. Someone who pays a lot and uses a little is not
                necessarily owed that difference — settlements are not counted here. The{' '}
                <strong>Balances</strong> tab is the one that says who owes whom.
              </p>
            </Section>
          )}

          {summary.data.largest_expense && (
            <Section title="Biggest single expense">
              <ListRow
                to={`/groups/${groupId}/expenses/${summary.data.largest_expense.id}`}
                leading={
                  <span className="bg-sunken text-muted flex size-10 items-center justify-center rounded-md">
                    <ReceiptIcon className="size-5" />
                  </span>
                }
                title={summary.data.largest_expense.title}
                subtitle={formatDay(summary.data.largest_expense.expense_date)}
                meta={
                  <Money
                    amount={summary.data.largest_expense.total_amount}
                    currency={currency}
                    size="lg"
                  />
                }
                metaSubtitle={
                  <Badge>{categoryLabelOf(summary.data.largest_expense.category)}</Badge>
                }
                className="bg-surface border-line rounded-xl border"
              />
            </Section>
          )}
        </>
      )}
    </Stack>
  )
}

function peakOf(months: { month: string; total: string }[], currency: string): string {
  const peak = months.reduce((best, point) =>
    Number(point.total) > Number(best.total) ? point : best,
  )
  return `${formatMonth(peak.month, 'long')} · ${formatMoney(peak.total, currency)}`
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 px-4">
      <h2 className="text-muted text-xs font-semibold tracking-wide uppercase">{title}</h2>
      {children}
    </section>
  )
}

function Stat({
  label,
  value,
  currency,
  caption,
}: {
  label: string
  value: string
  currency: string
  caption?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted text-xs font-medium">{label}</span>
      <Money amount={value} currency={currency} size="lg" />
      {caption && <span className="text-muted truncate text-xs">{caption}</span>}
    </div>
  )
}

function LoadingBlocks() {
  return (
    <Stack gap={4} className="px-4">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-40 w-full" />
    </Stack>
  )
}
