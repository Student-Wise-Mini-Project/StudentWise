import { describe, expect, it } from 'vitest'

import type { Notification } from '@/api/types'
import { translate } from '@/i18n/format'
import { catalogues, type MessageKey } from '@/i18n/messages'
import type { Locale, Vars } from '@/i18n/types'

import { renderNotification } from './render'

const tFor =
  (locale: Locale) =>
  (key: MessageKey, vars?: Vars): string =>
    translate(catalogues[locale], key, vars, locale)

const base = {
  id: 'n1',
  group_id: 'g1',
  actor: null,
  expense_id: null,
  settlement_id: null,
  read_at: null,
  created_at: '2026-09-11T10:00:00Z',
  title: 'server title',
  body: 'server body',
}

/** Every kind `notification_service.render()` can produce. */
const KINDS = [
  'EXPENSE_ADDED',
  'COMMENT_ADDED',
  'SETTLEMENT_RECORDED',
  'PAYMENT_REMINDER',
  'BUDGET_WARNING',
  'BUDGET_EXCEEDED',
  'BILL_DUE',
] as const

describe('renderNotification', () => {
  it('renders every kind the backend can produce, in Hebrew', () => {
    for (const kind of KINDS) {
      const result = renderNotification(tFor('he'), {
        ...base,
        kind,
        payload: { actor_name: 'גל', group_name: 'דיזנגוף', currency: 'ILS' },
      } as Notification)

      expect(result.title, kind).toBeTruthy()
      // No branch may quietly fall through to the server's English.
      expect(result.title, kind).not.toBe('server title')
    }
  })

  it('names the expense and the actor', () => {
    const result = renderNotification(tFor('en'), {
      ...base,
      kind: 'EXPENSE_ADDED',
      payload: {
        actor_name: 'Maya',
        group_name: 'Dizengoff',
        expense_title: 'Pizza',
        owed_amount: '33.34',
        total_amount: '100.00',
        currency: 'ILS',
      },
    } as Notification)

    expect(result.title).toContain('Maya')
    expect(result.title).toContain('Pizza')
    expect(result.body).toContain('33.34')
  })

  it('passes a comment excerpt through as the body, since it is user text', () => {
    const result = renderNotification(tFor('he'), {
      ...base,
      kind: 'COMMENT_ADDED',
      payload: { actor_name: 'Maya', expense_title: 'Pizza', excerpt: 'who ordered pineapple' },
    } as Notification)

    expect(result.body).toBe('who ordered pineapple')
  })

  it('tells being paid apart from having your payment recorded', () => {
    const received = renderNotification(tFor('he'), {
      ...base,
      kind: 'SETTLEMENT_RECORDED',
      payload: { actor_name: 'Maya', direction: 'received', amount: '50.00', currency: 'ILS' },
    } as Notification)
    const sent = renderNotification(tFor('he'), {
      ...base,
      kind: 'SETTLEMENT_RECORDED',
      payload: { actor_name: 'Maya', direction: 'sent', amount: '50.00', currency: 'ILS' },
    } as Notification)

    expect(received.title).not.toBe(sent.title)
  })

  it('says a bill needs an amount when the backend says the amount varies', () => {
    const varies = renderNotification(tFor('en'), {
      ...base,
      kind: 'BILL_DUE',
      payload: { bill_title: 'Electricity', due_on: '2026-10-01', needs_amount: true },
    } as Notification)

    expect(varies.title).toContain('enter the amount')
  })

  it('falls back to the server wording for a kind it does not know', () => {
    const result = renderNotification(tFor('he'), {
      ...base,
      kind: 'SOMETHING_NEW_FROM_THE_AI_WORK',
      payload: {},
    } as unknown as Notification)

    expect(result.title).toBe('server title')
    expect(result.body).toBe('server body')
  })
})
