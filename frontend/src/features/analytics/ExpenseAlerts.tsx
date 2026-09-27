import { Link } from 'react-router'

import { useGroupScope } from '@/features/groups/groupContext'
import { useT } from '@/i18n/i18nContext'
import { formatDay } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

import { useAnomalies, useDuplicates } from './api'

/**
 * On one expense's page: is this the unusual one, or half of a suspected
 * double payment? Uses the same cached reports as the Insights screen, so
 * opening an expense from there costs no extra request.
 */
export function ExpenseAlerts({ expenseId }: { expenseId: string }) {
  const t = useT()
  const { groupId, currency } = useGroupScope()
  const anomaly = useAnomalies(groupId).data?.anomalies.find((a) => a.expense.id === expenseId)
  const pairs = useDuplicates(groupId).data?.pairs ?? []
  const others = pairs.flatMap((pair) =>
    pair.first.id === expenseId ? [pair.second] : pair.second.id === expenseId ? [pair.first] : [],
  )

  if (!anomaly && others.length === 0) return null

  return (
    <div className="flex flex-col gap-2 px-4">
      {anomaly && (
        <p role="note" className="bg-warn-soft text-warn rounded-sm px-3 py-2.5 text-sm">
          {t(
            anomaly.direction === 'HIGH'
              ? 'analytics.alerts.detailHigh'
              : 'analytics.alerts.detailLow',
            {
              amount: formatMoney(anomaly.baseline, currency),
            },
          )}
        </p>
      )}
      {others.map((other) => (
        <p
          key={other.id}
          role="note"
          className="bg-warn-soft text-warn rounded-sm px-3 py-2.5 text-sm"
        >
          {t('analytics.alerts.detailDuplicate', {
            title: `⁨${other.title}⁩`,
            amount: formatMoney(other.total_amount, currency),
            date: formatDay(other.expense_date, 'short'),
            name: other.payer.name,
          })}{' '}
          <Link
            to={`/groups/${groupId}/expenses/${other.id}`}
            className="font-display font-bold underline"
          >
            {t('analytics.alerts.openOther')}
          </Link>
        </p>
      ))}
    </div>
  )
}
