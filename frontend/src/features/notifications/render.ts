import type { Notification } from '@/api/types'
import type { MessageKey } from '@/i18n/messages'
import type { Vars } from '@/i18n/types'

type T = (key: MessageKey, vars?: Vars) => string

/**
 * A notification's words, made on the client.
 *
 * A direct port of `notification_service.render()` in the backend, which builds
 * the same sentences in Python. The server still sends a rendered `title` and
 * `body` and they remain the fallback -- but they are English, so the client
 * composes its own from `kind` and `payload`. The API has shipped `payload`
 * since the first version for exactly this reason:
 *
 *   > `payload` is included as well so a client that wants to write its own
 *   > wording (in Hebrew, say) never has to parse English.
 *
 * A kind this does not know falls through to the server's wording rather than
 * to nothing, so a notification kind added by the AI work in Epic 5 degrades to
 * English instead of to a blank row.
 *
 * The Hebrew is gender-neutral throughout, which is why several of these read
 * as passives: the API stores no gender for an actor and should not start.
 */
export function renderNotification(t: T, item: Notification): { title: string; body: string } {
  const payload = (item.payload ?? {}) as Record<string, string | undefined>
  const actor = payload.actor_name ?? t('notifications.fallbackActor')
  const group = payload.group_name ?? t('notifications.fallbackGroup')
  const currency = payload.currency ?? ''

  switch (item.kind) {
    case 'EXPENSE_ADDED':
      return {
        title: t('notifications.kinds.expenseAddedTitle', {
          actor,
          expense: payload.expense_title ?? t('notifications.fallbackExpense'),
        }),
        body: t('notifications.kinds.expenseAddedBody', {
          owed: payload.owed_amount ?? '?',
          total: payload.total_amount ?? '?',
          currency,
          group,
        }),
      }

    case 'COMMENT_ADDED':
      return {
        title: t('notifications.kinds.commentAddedTitle', {
          actor,
          expense: payload.expense_title ?? t('notifications.fallbackExpense'),
        }),
        // Somebody's own words. Not ours to translate.
        body: payload.excerpt ?? '',
      }

    case 'SETTLEMENT_RECORDED':
      return {
        title: t(
          payload.direction === 'received'
            ? 'notifications.kinds.settlementReceivedTitle'
            : 'notifications.kinds.settlementSentTitle',
          { actor },
        ),
        body: t('notifications.kinds.settlementBody', {
          amount: payload.amount ?? '?',
          currency,
          group,
        }),
      }

    case 'PAYMENT_REMINDER':
      return {
        title: t('notifications.kinds.reminderTitle', { actor }),
        body: t('notifications.kinds.reminderBody', {
          amount: payload.amount ?? '?',
          currency,
          group,
        }),
      }

    case 'BILL_DUE': {
      const bill = payload.bill_title ?? t('notifications.fallbackBill')
      const when = payload.due_on ?? t('notifications.fallbackWhen')

      if (payload.needs_amount) {
        return {
          title: t('notifications.kinds.billDueNeedsAmountTitle', { bill }),
          body: t('notifications.kinds.billDueNeedsAmountBody', { when, group }),
        }
      }
      return {
        title: t('notifications.kinds.billDueTitle', { bill }),
        body: t('notifications.kinds.billDueBody', {
          amount: payload.amount ?? '?',
          currency,
          when,
          group,
        }),
      }
    }

    case 'BUDGET_WARNING':
    case 'BUDGET_EXCEEDED': {
      const scope = payload.category ?? t('notifications.budgetOverall')
      return {
        title: t(
          item.kind === 'BUDGET_EXCEEDED'
            ? 'notifications.kinds.budgetExceededTitle'
            : 'notifications.kinds.budgetWarningTitle',
          { group, scope },
        ),
        body: t('notifications.kinds.budgetBody', {
          spent: payload.spent ?? '?',
          limit: payload.limit ?? '?',
          share: payload.share_used ?? '?',
          currency,
          month: payload.month ?? '',
        }),
      }
    }

    default:
      // A kind this client has never heard of. The server's English is better
      // than a blank row, and this is the branch Epic 5's new kinds land in.
      return { title: item.title, body: item.body }
  }
}
