import { type FormEvent, useState } from 'react'

import { ApiError, detailOf } from '@/api/errors'
import type { AskAnswer } from '@/api/types'
import { AppBar } from '@/app/layouts/AppBar'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Spinner } from '@/components/Spinner'
import { Page, Stack } from '@/components/layout'
import { useGroupScope } from '@/features/groups/groupContext'
import { useLocale, useT } from '@/i18n/i18nContext'
import { formatMoney } from '@/lib/money'

import { isMoneyColumn, looksLikeAmount } from './alerts'
import { useAsk } from './api'

const SUGGESTIONS = [
  'analytics.ask.suggestions.s1',
  'analytics.ask.suggestions.s2',
  'analytics.ask.suggestions.s3',
  'analytics.ask.suggestions.s4',
] as const

type Entry =
  | { id: number; question: string; status: 'pending' }
  | { id: number; question: string; status: 'done'; answer: AskAnswer }
  | { id: number; question: string; status: 'failed'; error: unknown }

let nextId = 0

/**
 * 9.9: a question in plain words, answered from this group's own data.
 *
 * The server has Claude write one read-only SQL query, checks it against an
 * allowlist, and runs it against this group only. The screen shows the answer
 * as a table with a one-line explanation, and -- one tap away -- the query that
 * produced it, so an answer can be checked rather than taken on faith.
 *
 * Answers stack newest first for the visit, so a follow-up question can be
 * compared with the one before it.
 */
export function AskScreen() {
  const t = useT()
  const { locale } = useLocale()
  const { groupId, group } = useGroupScope()
  const ask = useAsk(groupId)
  const [question, setQuestion] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])

  const tooShort = question.trim().length > 0 && question.trim().length < 3

  function submit(text: string) {
    const cleaned = text.trim()
    if (cleaned.length < 3 || ask.isPending) return
    const id = (nextId += 1)
    setEntries((all) => [{ id, question: cleaned, status: 'pending' }, ...all])
    setQuestion('')
    ask.mutate(
      { question: cleaned, language: locale },
      {
        onSuccess: (answer) =>
          setEntries((all) =>
            all.map((e) => (e.id === id ? { id, question: cleaned, status: 'done', answer } : e)),
          ),
        onError: (error) =>
          setEntries((all) =>
            all.map((e) => (e.id === id ? { id, question: cleaned, status: 'failed', error } : e)),
          ),
      },
    )
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    submit(question)
  }

  return (
    <>
      <AppBar title={t('analytics.ask.title')} back={`/groups/${groupId}/insights`} />
      <Page width="narrow" padded>
        <Stack gap={4} className="py-4">
          <p className="text-muted text-sm">{t('analytics.ask.intro')}</p>

          <form onSubmit={onSubmit} className="flex gap-2">
            <Input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={500}
              dir="auto"
              aria-label={t('analytics.ask.inputAria')}
              placeholder={t('analytics.ask.placeholder')}
              className="min-w-0 flex-1"
            />
            <Button type="submit" disabled={question.trim().length < 3} loading={ask.isPending}>
              {t('analytics.ask.submit')}
            </Button>
          </form>
          {tooShort && <p className="text-muted -mt-2 text-xs">{t('analytics.ask.tooShort')}</p>}

          {entries.length === 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-muted font-display text-2xs font-extrabold tracking-widest uppercase">
                {t('analytics.ask.suggestionsLabel')}
              </span>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => submit(t(key))}
                    className="border-line text-ink hover:bg-sunken rounded-sm border px-3 py-1.5 text-start text-sm transition-colors"
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {entries.map((entry) => (
            <AnswerCard key={entry.id} entry={entry} currency={group.currency} />
          ))}
        </Stack>
      </Page>
    </>
  )
}

function AnswerCard({ entry, currency }: { entry: Entry; currency: string }) {
  const t = useT()
  const [showQuery, setShowQuery] = useState(false)

  return (
    <article className="bg-surface border-line flex flex-col gap-3 rounded-sm border p-4">
      <h2 className="font-display text-base font-extrabold" dir="auto">
        {entry.question}
      </h2>

      {entry.status === 'pending' && (
        <div className="text-muted flex items-center gap-2 text-sm">
          <Spinner size="sm" label={t('analytics.ask.thinking')} />
          <span>{t('analytics.ask.thinking')}</span>
        </div>
      )}

      {entry.status === 'failed' && (
        <p role="alert" className="text-danger text-sm">
          {entry.error instanceof ApiError && entry.error.status === 503
            ? t('analytics.ask.unavailable')
            : detailOf(entry.error)}
        </p>
      )}

      {entry.status === 'done' && (
        <>
          <p className="text-sm" dir="auto">
            {entry.answer.explanation}
          </p>
          <AnswerTable answer={entry.answer} currency={currency} />
          <p className="text-muted text-xs">
            {t('analytics.ask.rows', { count: entry.answer.row_count })}
            {entry.answer.truncated &&
              ` · ${t('analytics.ask.truncated', { count: entry.answer.row_count })}`}
          </p>
          <button
            type="button"
            aria-expanded={showQuery}
            onClick={() => setShowQuery((open) => !open)}
            className="text-accent font-display self-start text-sm font-bold"
          >
            {showQuery ? t('analytics.ask.hideQuery') : t('analytics.ask.showQuery')}
          </button>
          {showQuery && (
            <pre
              dir="ltr"
              className="bg-sunken overflow-x-auto rounded-sm p-3 text-xs whitespace-pre-wrap"
            >
              {entry.answer.sql}
            </pre>
          )}
        </>
      )}
    </article>
  )
}

function AnswerTable({ answer, currency }: { answer: AskAnswer; currency: string }) {
  const t = useT()
  if (answer.rows.length === 0) {
    return <p className="text-muted text-sm">{t('analytics.ask.noRows')}</p>
  }

  const label = (column: string) => answer.column_labels?.[column] ?? column.replace(/_/g, ' ')
  const cell = (column: string, value: unknown) => {
    if (value === null || value === undefined) return '—'
    if (isMoneyColumn(column) && looksLikeAmount(value)) return formatMoney(value, currency)
    return String(value)
  }

  return (
    // Wide answers scroll inside the card; the page itself never scrolls sideways.
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {answer.columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="border-line text-muted font-display border-b px-2 py-1.5 text-start text-xs font-extrabold"
              >
                {label(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {answer.rows.map((row, index) => (
            <tr key={index} className="border-line border-b last:border-b-0">
              {answer.columns.map((column) => (
                <td key={column} className="tnum px-2 py-1.5 text-start" dir="auto">
                  {cell(column, row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
