/**
 * Dates and times, formatted for reading.
 *
 * The API is precise about which is which: `expense_date` is a `YYYY-MM-DD` day
 * with no timezone, and `created_at` / `occurred_at` are ISO-8601 UTC instants.
 * They must not be formatted the same way -- parsing a bare `YYYY-MM-DD` as an
 * instant shifts it by the local offset, which is how an expense entered on the
 * 1st shows up as the 31st for anyone west of UTC.
 */

import { catalogues } from '@/i18n/messages'
import type { Locale } from '@/i18n/types'

import { currentLocale } from './locale'

/**
 * `en-GB` rather than `en-US` on purpose: the English copy is British, and
 * "1 Sep 2026" is the form every screen was written against.
 */
const TAGS: Record<Locale, string> = { en: 'en-GB', he: 'he-IL' }

type DateStyle = 'day' | 'dayShort' | 'time' | 'dayHeader' | 'month' | 'monthYear'

const OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  day: { day: 'numeric', month: 'short', year: 'numeric' },
  dayShort: { day: 'numeric', month: 'short' },
  time: { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
  dayHeader: { day: 'numeric', month: 'long' },
  month: { month: 'short' },
  monthYear: { month: 'long', year: 'numeric' },
}

/**
 * Formatters are cached per locale *and* per style. They used to be six
 * module-scope constants, which pinned the whole app to one language for the
 * life of the tab.
 */
const dateFormatters = new Map<string, Intl.DateTimeFormat>()

function dateFormat(style: DateStyle): Intl.DateTimeFormat {
  const locale = currentLocale()
  const key = `${locale}:${style}`
  const cached = dateFormatters.get(key)
  if (cached) return cached
  const made = new Intl.DateTimeFormat(TAGS[locale], OPTIONS[style])
  dateFormatters.set(key, made)
  return made
}

const relativeFormatters = new Map<Locale, Intl.RelativeTimeFormat>()

function relativeFormat(): Intl.RelativeTimeFormat {
  const locale = currentLocale()
  const cached = relativeFormatters.get(locale)
  if (cached) return cached
  const made = new Intl.RelativeTimeFormat(TAGS[locale], { numeric: 'auto' })
  relativeFormatters.set(locale, made)
  return made
}

/** The three words this module owns, in the active language. */
function word(key: 'today' | 'yesterday' | 'justNow'): string {
  return catalogues[currentLocale()][`common.dates.${key}`] as string
}

/** A calendar day (`"2026-09-11"`), formatted without ever becoming an instant. */
export function formatDay(day: string, style: 'short' | 'long' = 'long'): string {
  const [year, month, date] = day.split('-').map(Number)
  if (!year || !month || !date) return day
  // Local noon, so a local-midnight DST shift cannot roll the date over.
  const value = new Date(year, month - 1, date, 12)
  return dateFormat(style === 'short' ? 'dayShort' : 'day').format(value)
}

/** Today, as the API wants it. */
export function today(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

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

  if (magnitude < 45_000) return word('justNow')
  if (magnitude > 30 * 24 * 60 * 60_000) return dateFormat('time').format(then)

  for (const [unit, ms] of UNITS) {
    if (magnitude >= ms) return relativeFormat().format(Math.round(diff / ms), unit)
  }
  return word('justNow')
}

/** The full timestamp, for a `title` attribute where the relative one is vague. */
export function formatTimestamp(isoTimestamp: string): string {
  const value = new Date(isoTimestamp)
  return Number.isNaN(value.getTime()) ? '' : dateFormat('time').format(value)
}

/**
 * The date a feed groups under: `"Today"`, `"Yesterday"`, or `"1 September"`.
 *
 * Takes an instant and answers in the reader's own calendar days, which is the
 * only thing "today" can mean. Comparing local calendar days rather than
 * subtracting milliseconds is deliberate: 23:30 and 00:30 are sixty minutes
 * apart *and* two different days, and a feed that files the second under
 * "today" while the phone clock says otherwise looks broken.
 */
export function formatDayHeader(isoTimestamp: string, now: Date = new Date()): string {
  const then = new Date(isoTimestamp)
  if (Number.isNaN(then.getTime())) return ''

  const key = (value: Date) => `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)

  if (key(then) === key(now)) return word('today')
  if (key(then) === key(yesterday)) return word('yesterday')
  return then.getFullYear() === now.getFullYear()
    ? dateFormat('dayHeader').format(then)
    : dateFormat('day').format(then)
}

/**
 * `"2026-09"` to `"Sep"`, or `"September 2026"`.
 *
 * Built from the parts rather than parsed as a date, for the same reason
 * `formatDay` is: `new Date("2026-09")` is an *instant* at UTC midnight, which is
 * August the 31st for anyone west of Greenwich.
 */
export function formatMonth(month: string, style: 'short' | 'long' = 'short'): string {
  const [year, index] = month.split('-').map(Number)
  if (!year || !index) return month
  const value = new Date(year, index - 1, 15, 12)
  return dateFormat(style === 'short' ? 'month' : 'monthYear').format(value)
}
