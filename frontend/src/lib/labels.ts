import type {
  ExpenseCategory,
  ExpenseSource,
  GroupType,
  MemberRole,
  NotificationKind,
  SettlementMethod,
  SplitType,
} from '@/api/types'

/**
 * Enum values to English, in one place.
 *
 * This is the translation seam. The UI is English today and Hebrew later; when
 * that happens a second table goes in this file and every screen follows,
 * because no screen writes `SHARED_APARTMENT` into the DOM itself.
 *
 * Deliberately *not* a full i18n system. The choice made was "RTL-ready", which
 * is a layout problem that logical CSS properties solve. Translation is a
 * separate axis, and routing every button label through `t('...')` before anyone
 * needs a second language buys indirection rather than readiness.
 */

export const groupTypeLabel: Record<GroupType, string> = {
  SHARED_APARTMENT: 'Flat',
  COUPLE: 'Couple',
  SOLO: 'Personal',
  TRIP: 'Trip',
}

export const memberRoleLabel: Record<MemberRole, string> = {
  OWNER: 'Owner',
  MEMBER: 'Member',
}

export const categoryLabel: Record<ExpenseCategory, string> = {
  GROCERIES: 'Groceries',
  RENT: 'Rent',
  UTILITIES: 'Utilities',
  EATING_OUT: 'Eating out',
  ENTERTAINMENT: 'Entertainment',
  TRANSPORT: 'Transport',
  OTHER: 'Other',
}

export const splitTypeLabel: Record<SplitType, string> = {
  EQUAL: 'Equally',
  EXACT: 'Exact amounts',
  PERCENTAGE: 'Percentages',
  WEIGHT: 'Shares',
}

/** The one-line explanation under each split mode. */
export const splitTypeHint: Record<SplitType, string> = {
  EQUAL: 'Everyone selected pays the same.',
  EXACT: 'Type what each person owes. It has to add up to the total.',
  PERCENTAGE: 'Type each share as a percentage. It has to add up to 100.',
  WEIGHT: 'Split in proportion — 2 shares to 1 pays twice as much.',
}

export const settlementMethodLabel: Record<SettlementMethod, string> = {
  MANUAL: 'Cash or transfer',
  BIT: 'Bit',
  PAYBOX: 'PayBox',
}

/**
 * Only `MANUAL` and `RECURRING` occur in practice today. The rest exist for the
 * AI ingestion work in Epic 5 and are listed so the feed does not render a bare
 * enum value the day one of them first appears.
 */
export const sourceLabel: Record<ExpenseSource, string> = {
  MANUAL: 'Added by hand',
  VOICE: 'Added by voice',
  OCR: 'Read from a receipt',
  GMAIL_API: 'Found in email',
  RECURRING: 'Posted by a schedule',
}

export const notificationKindLabel: Record<NotificationKind, string> = {
  EXPENSE_ADDED: 'New expense',
  COMMENT_ADDED: 'New comment',
  SETTLEMENT_RECORDED: 'Payment recorded',
  PAYMENT_REMINDER: 'Reminder',
  BUDGET_WARNING: 'Budget warning',
  BUDGET_EXCEEDED: 'Budget exceeded',
  BILL_DUE: 'Bill due',
}

/** A category is optional on an expense; `null` is a real, common state. */
export function categoryLabelOf(category: ExpenseCategory | null | undefined): string {
  return category ? categoryLabel[category] : 'Uncategorised'
}
