import type { RecurrenceFrequency } from '@/api/types'
import type { MessageKey } from '@/i18n/messages'
import type { Vars } from '@/i18n/types'

type T = (key: MessageKey, vars?: Vars) => string

/**
 * "Monthly", "Every 2 months". The same move `lib/labels.ts` makes for the
 * other enums, kept beside the feature that is the only one using it.
 */
export function frequencyLabel(t: T, frequency: RecurrenceFrequency): string {
  return t(`recurring.frequency.${frequency}` as MessageKey)
}
