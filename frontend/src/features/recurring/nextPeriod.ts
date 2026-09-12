import type { RecurrenceFrequency } from '@/api/types'

const MONTHS_PER_PERIOD: Record<RecurrenceFrequency, number> = {
  MONTHLY: 1,
  EVERY_2_MONTHS: 2,
  QUARTERLY: 3,
  YEARLY: 12,
}

/**
 * One period after `date`, as an ISO date string.
 *
 * This is what the "Repeats" toggle sets as a new bill's `first_due_on`. It is
 * deliberately *not* the expense's own date: the expense being added is this
 * period's, so a schedule starting on the same day would have tonight's `run`
 * post it a second time -- and the unique index behind that would turn the
 * next group open into a 409.
 *
 * The day is clamped into short months the same way the backend's
 * `clamp_to_month` does, so the 31st of January repeats on the 28th of
 * February rather than silently sliding into March.
 */
export function onePeriodAfter(date: string, frequency: RecurrenceFrequency): string {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return date

  const total = year * 12 + (month - 1) + MONTHS_PER_PERIOD[frequency]
  const nextYear = Math.floor(total / 12)
  const nextMonth = (total % 12) + 1
  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate()
  const clamped = Math.min(day, lastDay)

  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`
}
