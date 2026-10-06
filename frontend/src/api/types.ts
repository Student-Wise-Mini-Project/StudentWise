/**
 * Friendly names for the generated schema types.
 *
 * `schema.d.ts` is machine-written and its names follow FastAPI's conventions
 * (`ExpenseOut`, `Page_ExpenseOut_`). Screens should not have to read those, and
 * more importantly nothing outside this file should reach into
 * `components['schemas'][...]` -- if a backend model is ever renamed, this is the
 * one file that has to change.
 */
import type { components } from './schema'

type S = components['schemas']

export type User = S['UserOut']
export type Group = S['GroupOut']
export type GroupMember = S['GroupMemberOut']
export type Expense = S['ExpenseOut']
export type ExpenseSplit = S['ExpenseSplitOut']
export type ExpenseCreate = S['ExpenseCreate']
export type ExpenseUpdate = S['ExpenseUpdate']
export type ParticipantIn = S['ParticipantIn']
export type Settlement = S['SettlementOut']
export type SettlementCreate = S['SettlementCreate']
export type UserBalance = S['UserBalanceOut']
export type GroupBalances = S['GroupBalancesOut']
export type SettlementPlan = S['SettlementPlanOut']
export type PlannedTransfer = S['PlannedTransferOut']
export type ActivityItem = S['ActivityOut']
export type Comment = S['CommentOut']
export type Notification = S['NotificationOut']
export type AuthResponse = S['AuthResponse']
export type SplitRule = S['SplitRuleOut']
export type SplitRuleSummary = S['SplitRuleSummary']
export type RecurringBill = S['RecurringBillOut']
export type RecurringBillCreate = S['RecurringBillCreate']
export type RecurringBillUpdate = S['RecurringBillUpdate']
export type RecurrenceFrequency = S['RecurrenceFrequency']
export type RunResult = S['RunResultOut']
export type ItemIn = S['ItemIn']
export type ExpenseItem = S['ExpenseItemOut']
export type ItemPreview = S['ItemPreviewOut']
export type ReceiptScan = S['ReceiptScanOut']
export type ScanWarning = S['ScanWarning']
export type GmailStatus = S['GmailStatusOut']
export type GmailSync = S['GmailSyncOut']
export type IngestedBill = S['IngestedBillOut']
export type IngestedBillStatus = S['IngestedBillStatus']
export type BillReviewReason = S['BillReviewReason']

export type Summary = S['SummaryOut']
export type CategoryBreakdown = S['CategoryBreakdownOut']
export type CategorySlice = S['CategorySliceOut']
export type MonthlyTrend = S['MonthlyTrendOut']
export type MonthPoint = S['MonthPointOut']
export type MemberBreakdown = S['MemberBreakdownOut']
export type MemberSlice = S['MemberSliceOut']
export type AnomalyReport = S['AnomalyReportOut']
export type Anomaly = S['AnomalyOut']
export type DuplicateReport = S['DuplicateReportOut']
export type DuplicatePair = S['DuplicatePairOut']
export type AskAnswer = S['AskResponse']
export type Conversation = S['ConversationOut']
export type ConversationDetail = S['ConversationDetailOut']
export type ChatMessage = S['ChatMessageOut']
export type ToolUse = S['ToolUseOut']

export type GroupType = S['GroupType']
export type MemberRole = S['MemberRole']
export type ExpenseCategory = S['ExpenseCategory']
export type SplitType = S['SplitType']
export type ExpenseSource = S['ExpenseSource']
export type SettlementMethod = S['SettlementMethod']
export type NotificationKind = S['NotificationKind']

/**
 * The paged envelope, written once.
 *
 * The generator emits a separate concrete type per item type
 * (`Page_ExpenseOut_`, `Page_CommentOut_`, ...) because OpenAPI has no
 * generics. They are structurally identical, so one generic here lets
 * `usePagedQuery` be written a single time instead of six.
 *
 * `total` counts rows matching the filters, ignoring limit and offset -- which
 * is why a list header can honestly say "18 expenses" while showing 20 rows.
 */
export type Page<T> = {
  items: T[]
  total: number
  limit: number
  offset: number
  readonly has_more: boolean
}

/**
 * Enum values as arrays, for dropdowns -- and a compile error when the backend
 * grows one.
 *
 * `satisfies readonly GroupType[]` would only check that each listed value is
 * *valid*; a new backend enum member would slip through and simply never appear
 * in the UI. `allOf` checks the other direction too: if the array does not cover
 * every member of the union, the argument type collapses to `never` and the
 * build fails.
 *
 * This is the frontend half of the lesson the backend learned the hard way --
 * enum members get added, and nothing notices until something is quietly missing
 * in production.
 */
function allOf<T extends string>() {
  return <const V extends readonly T[]>(
    values: V &
      ([T] extends [V[number]] ? unknown : { __missing_enum_members: Exclude<T, V[number]> }),
  ): V => values
}

export const GROUP_TYPES = allOf<GroupType>()(['SHARED_APARTMENT', 'COUPLE', 'SOLO', 'TRIP'])

export const EXPENSE_CATEGORIES = allOf<ExpenseCategory>()([
  'GROCERIES',
  'RENT',
  'UTILITIES',
  'EATING_OUT',
  'ENTERTAINMENT',
  'TRANSPORT',
  'OTHER',
])

export const SPLIT_TYPES = allOf<SplitType>()(['EQUAL', 'EXACT', 'PERCENTAGE', 'WEIGHT'])

export const SETTLEMENT_METHODS = allOf<SettlementMethod>()(['MANUAL', 'BIT', 'PAYBOX'])

export const RECURRENCE_FREQUENCIES = allOf<RecurrenceFrequency>()([
  'MONTHLY',
  'EVERY_2_MONTHS',
  'QUARTERLY',
  'YEARLY',
])

export const EXPENSE_SOURCES = allOf<ExpenseSource>()([
  'MANUAL',
  'VOICE',
  'OCR',
  'GMAIL_API',
  'RECURRING',
])

export const SCAN_WARNINGS = allOf<ScanWarning>()([
  'NO_ITEMS',
  'TOTAL_MISSING',
  'DATE_MISSING',
  'LINES_UNREADABLE',
  'CURRENCY_MISMATCH',
])

/** Every reason must have words in both catalogues; this is what makes a new one a build error. */
export const BILL_REVIEW_REASONS = allOf<BillReviewReason>()([
  'NOT_A_BILL',
  'UNREADABLE',
  'NO_AMOUNT',
  'NO_FLAT',
  'AMBIGUOUS_FLAT',
  'UNKNOWN_SENDER',
  'RECURRING_CONFLICT',
  'CURRENCY_MISMATCH',
  'DUPLICATE',
])

export const NOTIFICATION_KINDS = allOf<NotificationKind>()([
  'EXPENSE_ADDED',
  'COMMENT_ADDED',
  'SETTLEMENT_RECORDED',
  'PAYMENT_REMINDER',
  'BUDGET_WARNING',
  'BUDGET_EXCEEDED',
  'BILL_DUE',
])
