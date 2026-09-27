import type { Anomaly, DuplicatePair } from '@/api/types'
import { Badge } from '@/components/Badge'
import { ListRow } from '@/components/ListRow'
import { Money } from '@/components/Money'
import { useGroupScope } from '@/features/groups/groupContext'
import { useT } from '@/i18n/i18nContext'
import { formatDay } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

import { duplicateReasons } from './alerts'
import { useAnomalies, useDuplicates } from './api'

/**
 * 9.10: what looks wrong, before anyone has to go looking.
 *
 * Two kinds, from two detectors that already exist on the server: an expense
 * far from its own history (this electricity bill against previous ones), and
 * two expenses that look like one payment entered twice. Both are suggestions --
 * nothing here changes an expense -- so each item opens the expense and lets a
 * person decide.
 *
 * Renders nothing at all when there is nothing to say: an empty "all clear"
 * block on every visit teaches people to scroll past the section.
 */
export function WorthALook() {
  const t = useT()
  const { groupId } = useGroupScope()
  const anomalies = useAnomalies(groupId).data?.anomalies ?? []
  const pairs = useDuplicates(groupId).data?.pairs ?? []

  if (anomalies.length === 0 && pairs.length === 0) return null

  return (
    <section aria-labelledby="worth-a-look" className="flex flex-col gap-2 px-4">
      <h2
        id="worth-a-look"
        className="text-muted font-display text-2xs font-extrabold tracking-widest uppercase"
      >
        {t('analytics.alerts.header')}
      </h2>
      {anomalies.map((anomaly) => (
        <AnomalyRow key={anomaly.expense.id} anomaly={anomaly} />
      ))}
      {pairs.map((pair) => (
        <DuplicateCard key={`${pair.first.id}-${pair.second.id}`} pair={pair} />
      ))}
    </section>
  )
}

function AnomalyRow({ anomaly }: { anomaly: Anomaly }) {
  const t = useT()
  const { groupId, currency } = useGroupScope()
  const high = anomaly.direction === 'HIGH'
  // A percentage, not money: rounding it for display divides nobody's share.
  const percent = Math.abs(Math.round(Number(anomaly.percent_change)))

  return (
    <ListRow
      to={`/groups/${groupId}/expenses/${anomaly.expense.id}`}
      title={<bdi>{anomaly.expense.title}</bdi>}
      subtitle={t('analytics.alerts.usually', {
        date: formatDay(anomaly.expense.expense_date, 'short'),
        amount: formatMoney(anomaly.baseline, currency),
      })}
      meta={<Money amount={anomaly.expense.total_amount} currency={currency} size="lg" />}
      metaSubtitle={
        <Badge tone={high ? 'warn' : 'accent'}>
          {high ? t('analytics.alerts.high') : t('analytics.alerts.low')} ·{' '}
          {high
            ? t('analytics.alerts.percentHigher', { percent })
            : t('analytics.alerts.percentLower', { percent })}
        </Badge>
      }
      className="bg-surface border-line rounded-sm border"
    />
  )
}

function DuplicateCard({ pair }: { pair: DuplicatePair }) {
  const t = useT()
  const { groupId, currency } = useGroupScope()
  const reasons = duplicateReasons(pair)
    .map((reason) =>
      reason.count === undefined ? t(reason.key) : t(reason.key, { count: reason.count }),
    )
    .join(' · ')

  return (
    <article className="bg-surface border-line flex flex-col rounded-sm border">
      <div className="flex flex-col gap-1.5 px-4 pt-3">
        <Badge tone="warn" className="self-start">
          {t('analytics.alerts.duplicate')}
        </Badge>
        <p className="text-muted text-xs">{reasons}</p>
      </div>
      {[pair.first, pair.second].map((side) => (
        <ListRow
          key={side.id}
          dense
          to={`/groups/${groupId}/expenses/${side.id}`}
          title={<bdi>{side.title}</bdi>}
          subtitle={t('analytics.alerts.paidBy', {
            name: side.payer.name,
            date: formatDay(side.expense_date, 'short'),
          })}
          meta={<Money amount={side.total_amount} currency={currency} size="md" />}
        />
      ))}
    </article>
  )
}
