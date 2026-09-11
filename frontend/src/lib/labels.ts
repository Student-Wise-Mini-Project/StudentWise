import type {
  ExpenseCategory,
  ExpenseSource,
  GroupType,
  MemberRole,
  NotificationKind,
  SettlementMethod,
  SplitType,
} from '@/api/types'
import type { MessageKey } from '@/i18n/messages'
import type { Vars } from '@/i18n/types'

/**
 * Enum values to words, in one place.
 *
 * This was the translation seam, and it has now been used. What used to be a
 * `Record<Enum, string>` per enum is a function taking the `t` from `useT()`.
 * The old comment here predicted that "a second table goes in this file and
 * every screen follows, because no screen writes `SHARED_APARTMENT` into the
 * DOM itself" -- which held: this was the only file that needed a new idea, and
 * the screens only needed a `t`.
 *
 * The `as MessageKey` casts are the one place the types are loosened. The enum
 * unions come from the generated API types, so the *inputs* are checked at
 * every call site; only the assembled dotted string is not, and
 * `messages.test.ts` asserts both catalogues carry the same key set.
 */
type T = (key: MessageKey, vars?: Vars) => string

export function groupTypeLabel(t: T, type: GroupType): string {
  return t(`groups.types.${type}` as MessageKey)
}

export function memberRoleLabel(t: T, role: MemberRole): string {
  return t(`groups.roles.${role}` as MessageKey)
}

export function categoryLabel(t: T, category: ExpenseCategory): string {
  return t(`expenses.categories.${category}` as MessageKey)
}

/** A category is optional on an expense; `null` is a real, common state. */
export function categoryLabelOf(t: T, category: ExpenseCategory | null | undefined): string {
  return t(
    category ? (`expenses.categories.${category}` as MessageKey) : 'expenses.categories.NONE',
  )
}

export function splitTypeLabel(t: T, type: SplitType): string {
  return t(`expenses.splitTypes.${type}` as MessageKey)
}

/** The one-line explanation under each split mode. */
export function splitTypeHint(t: T, type: SplitType): string {
  return t(`expenses.splitHints.${type}` as MessageKey)
}

export function settlementMethodLabel(t: T, method: SettlementMethod): string {
  return t(`balances.methods.${method}` as MessageKey)
}

/**
 * Only `MANUAL` and `RECURRING` occur in practice today. The rest exist for the
 * AI ingestion work in Epic 5 and are listed so the feed does not render a bare
 * enum value the day one of them first appears.
 */
export function sourceLabel(t: T, source: ExpenseSource): string {
  return t(`expenses.sources.${source}` as MessageKey)
}

/**
 * The kind, as a short label. The full sentence is built by
 * `features/notifications/render.ts`; this is for a badge or a filter.
 */
export function notificationKindLabel(t: T, kind: NotificationKind): string {
  return t(`notifications.kindLabels.${kind}` as MessageKey)
}
