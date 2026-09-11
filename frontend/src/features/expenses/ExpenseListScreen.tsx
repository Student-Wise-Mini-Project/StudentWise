import { useSearchParams } from 'react-router'

import type { Expense, ExpenseCategory } from '@/api/types'
import { Avatar } from '@/components/Avatar'
import { Badge } from '@/components/Badge'
import { InfiniteList } from '@/components/InfiniteList'
import { LinkButton } from '@/components/Button'
import { ListRow } from '@/components/ListRow'
import { Money } from '@/components/Money'
import { EmptyState } from '@/components/feedback'
import { ChevronEnd, ReceiptIcon } from '@/components/icons'
import { useGroupScope } from '@/features/groups/groupContext'
import { cn } from '@/lib/cn'
import { formatDay } from '@/lib/dates'
import { EXPENSE_CATEGORIES } from '@/api/types'
import { categoryLabelOf } from '@/lib/labels'

import { useExpenses, type ExpenseFilters } from './api'

/**
 * Filters live in the URL, not in component state.
 *
 * That makes a filtered list shareable and survivable across a refresh, and it
 * means the back button undoes a filter the way people expect it to.
 */
function useFilters(): [ExpenseFilters, (next: ExpenseFilters) => void] {
  const [params, setParams] = useSearchParams()

  const filters: ExpenseFilters = {}
  const category = params.get('category')
  const payer = params.get('payer_id')
  if (category) filters.category = category as ExpenseCategory
  if (payer) filters.payer_id = payer

  const set = (next: ExpenseFilters) => {
    const updated = new URLSearchParams(params)
    for (const key of ['category', 'payer_id'] as const) {
      const value = next[key]
      if (value) updated.set(key, value)
      else updated.delete(key)
    }
    setParams(updated, { replace: true })
  }

  return [filters, set]
}

export function ExpenseListScreen() {
  const { groupId, currency, activeMembers } = useGroupScope()
  const [filters, setFilters] = useFilters()
  const expenses = useExpenses(groupId, filters)

  const filtered = Boolean(filters.category ?? filters.payer_id)

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
        <p className="text-muted text-sm">
          {expenses.isLoading ? (
            'Loading'
          ) : (
            <>
              <span className="tnum text-ink font-semibold">{expenses.total}</span>{' '}
              {expenses.total === 1 ? 'expense' : 'expenses'}
              {filtered && ' matching'}
            </>
          )}
        </p>
        <LinkButton to={`/groups/${groupId}/expenses/new`} size="sm">
          Add
        </LinkButton>
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 pb-3">
        <FilterChip label="Everything" active={!filtered} onClick={() => setFilters({})} />
        {EXPENSE_CATEGORIES.map((category) => (
          <FilterChip
            key={category}
            label={categoryLabelOf(category)}
            active={filters.category === category}
            onClick={() =>
              setFilters({
                ...filters,
                category: filters.category === category ? undefined : category,
              })
            }
          />
        ))}
      </div>

      {activeMembers.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-3">
          {activeMembers.map((member) => (
            <FilterChip
              key={member.user.id}
              label={`${member.user.name} paid`}
              active={filters.payer_id === member.user.id}
              onClick={() =>
                setFilters({
                  ...filters,
                  payer_id: filters.payer_id === member.user.id ? undefined : member.user.id,
                })
              }
            />
          ))}
        </div>
      )}

      <InfiniteList
        query={expenses}
        renderItem={(expense: Expense) => (
          <ListRow
            key={expense.id}
            to={`/groups/${groupId}/expenses/${expense.id}`}
            leading={<Avatar user={expense.payer} />}
            title={expense.title}
            subtitle={`${expense.payer.name} paid · ${formatDay(expense.expense_date, 'short')}`}
            meta={<Money amount={expense.total_amount} currency={currency} size="lg" />}
            metaSubtitle={
              expense.splits.length === activeMembers.length
                ? categoryLabelOf(expense.category)
                : `${expense.splits.length} of ${activeMembers.length}`
            }
            trailing={
              <span className="flex items-center gap-1">
                {expense.receipt_url && <ReceiptIcon className="text-faint size-4" />}
                {expense.source === 'RECURRING' && <Badge tone="neutral">Auto</Badge>}
                <ChevronEnd />
              </span>
            }
          />
        )}
        empty={
          filtered ? (
            <EmptyState
              title="Nothing matches"
              body="Try a different filter."
              action={{ label: 'Clear filters', onClick: () => setFilters({}) }}
              size="page"
            />
          ) : (
            <EmptyState
              icon={<ReceiptIcon className="size-10" />}
              title="No expenses yet"
              body="Add the first one and everyone in the group will see it."
              action={{ label: 'Add an expense', to: `/groups/${groupId}/expenses/new` }}
            />
          )
        }
      />
    </>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'font-display shrink-0 rounded-sm border px-3 py-1.5 text-sm font-bold whitespace-nowrap transition-colors',
        active
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-line text-muted hover:text-ink',
      )}
    >
      {label}
    </button>
  )
}
