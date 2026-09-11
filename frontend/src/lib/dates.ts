/**
 * Dates and times, formatted for reading.
 *
 * The API is precise about which is which: `expense_date` is a `YYYY-MM-DD` day
 * with no timezone, and `created_at` / `occurred_at` are ISO-8601 UTC instants.
 * They must not be formatted the same way -- parsing a bare `YYYY-MM-DD` as an
 * instant shifts it by the local offset, which is how an expense entered on the
 * 1st shows up as the 31st for anyone west of UTC.
 */

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const dayShortFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

/** A calendar day (`"2026-09-11"`), formatted without ever becoming an instant. */
export function formatDay(day: string, style: 'short' | 'long' = 'long'): string {
  const [year, month, date] = day.split('-').map(Number)
  if (!year || !month || !date) return day
  // Local noon, so a local-midnight DST shift cannot roll the date over.
  const value = new Date(year, month - 1, date, 12)
  return (style === 'short' ? dayShortFormat : dayFormat).format(value)
}

/** Today, as the API wants it. */
export function today(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60_000],
  ['month', 30 * 24 * 60 * 60_000],
  ['week', 7 * 24 * 60 * 60_000],
  ['day', 24 * 60 * 60_000],
  ['hour', 60 * 60_000],
  ['minute', 60_000],
]

/** "3 hours ago", "yesterday". Falls back to a date once it stops being useful. */
export function formatRelative(isoTimestamp: string, now: Date = new Date()): string {
  const then = new Date(isoTimestamp)
  if (Number.isNaN(then.getTime())) return ''

  const diff = then.getTime() - now.getTime()
  const magnitude = Math.abs(diff)

  if (magnitude < 45_000) return 'just now'
  if (magnitude > 30 * 24 * 60 * 60_000) return timeFormat.format(then)

  for (const [unit, ms] of UNITS) {
    if (magnitude >= ms) return relative.format(Math.round(diff / ms), unit)
  }
  return 'just now'
}

/** The full timestamp, for a `title` attribute where the relative one is vague. */
export function formatTimestamp(isoTimestamp: string): string {
  const value = new Date(isoTimestamp)
  return Number.isNaN(value.getTime()) ? '' : timeFormat.format(value)
}
