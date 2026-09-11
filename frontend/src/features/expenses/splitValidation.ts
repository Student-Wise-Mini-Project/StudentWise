import type { SplitType } from '@/api/types'
import type { MessageKey } from '@/i18n/messages'
import type { Vars } from '@/i18n/types'
import { addAll, allPositive, isValidAmount, remaining, subtract } from '@/lib/money'

/**
 * Predicates only. **This file must never grow a rounding function.**
 *
 * `docs/api-contract.md` says "never re-derive splits on the client", and it
 * means it: the backend allocates cents with the largest-remainder method, so
 * `100.00` across three people is `33.34 / 33.33 / 33.33`. A second
 * implementation of that rule in TypeScript would agree almost always and
 * disagree on exactly the cases people notice, and then the balances screen
 * contradicts the expense list and neither can be trusted.
 *
 * What this file does instead is check what the user typed:
 *
 *   EQUAL       nothing to check -- there is nothing to type
 *   EXACT       the parts must add up to the total, to the cent
 *   PERCENTAGE  the parts must add up to 100
 *   WEIGHT      every weight must be above zero
 *
 * The one convenience, `remainderFor`, is `total - sum(the others)`: a
 * subtraction over numbers the user entered, not a rounding policy.
 */

export type ParticipantDraft = {
  userId: string
  /** What the user typed: an amount, a percentage or a weight, by split type. */
  shareValue: string
}

export type SplitValidation = {
  valid: boolean
  /**
   * What to show under the editor -- a catalogue key, not a sentence.
   *
   * This function is pure and has no hook, so it cannot translate. Returning
   * the key also makes the tests stronger: they stop breaking when copy is
   * reworded, and start failing if a key disappears.
   */
  messageKey: MessageKey | null
  /** Interpolation for `messageKey`, where it takes any. */
  messageVars?: Vars
  /** For EXACT: what is still unallocated. Negative means over-allocated. */
  remaining: string | null
}

export function validateSplit(
  splitType: SplitType,
  participants: ParticipantDraft[],
  total: string,
): SplitValidation {
  if (participants.length === 0) {
    return { valid: false, messageKey: 'expenses.split.pickOne', remaining: null }
  }

  const values = participants.map((participant) => participant.shareValue)

  switch (splitType) {
    case 'EQUAL':
      // The server decides the cents. There is nothing here to be wrong about.
      return { valid: true, messageKey: null, remaining: null }

    case 'EXACT': {
      if (!values.every(isBlankOrNumber)) {
        return { valid: false, messageKey: 'expenses.split.notANumber', remaining: null }
      }
      // The total is a form field, so it is empty for as long as it takes
      // somebody to type it -- and "split this exactly" before there is a total
      // is a perfectly ordinary order to do things in. There is simply nothing
      // to allocate against yet, which is not the same as the split being wrong.
      if (!isValidAmount(total)) {
        return { valid: false, messageKey: 'expenses.split.totalFirst', remaining: null }
      }
      const left = remaining(values.map(orZero), total)
      if (left === '0.00') return { valid: true, messageKey: null, remaining: '0.00' }
      return {
        valid: false,
        messageKey: left.startsWith('-')
          ? 'expenses.split.overBy'
          : 'expenses.split.stillToAllocate',
        messageVars: { amount: left.startsWith('-') ? left.slice(1) : left },
        remaining: left,
      }
    }

    case 'PERCENTAGE': {
      if (!values.every(isBlankOrNumber)) {
        return { valid: false, messageKey: 'expenses.split.shareNotANumber', remaining: null }
      }
      const sum = addAll(values.map(orZero))
      if (sum === '100.00') return { valid: true, messageKey: null, remaining: null }
      return {
        valid: false,
        messageKey: 'expenses.split.percentSum',
        messageVars: { sum },
        remaining: null,
      }
    }

    case 'WEIGHT':
      return allPositive(values)
        ? { valid: true, messageKey: null, remaining: null }
        : { valid: false, messageKey: 'expenses.split.shareAboveZero', remaining: null }
  }
}

/**
 * What is left once everyone else has been given their amount.
 *
 * Offered as a "give the rest to X" button on EXACT splits. It is a subtraction
 * over what the user typed, which is why it is allowed to exist here.
 */
export function remainderFor(
  participants: ParticipantDraft[],
  userId: string,
  total: string,
): string | null {
  const others = participants.filter((participant) => participant.userId !== userId)
  // No total yet means no remainder to offer -- same reason as above.
  if (!isValidAmount(total)) return null
  if (!others.every((participant) => isBlankOrNumber(participant.shareValue))) return null
  return subtract(total, addAll(others.map((participant) => orZero(participant.shareValue))))
}

/**
 * An untouched field is not an error.
 *
 * Someone entering an exact split types one amount and expects to be offered
 * "give the rest to X". Treating every empty box as invalid until all of them
 * are filled inverts that: the help only appears once it is no longer needed.
 * Blank means zero-so-far; only actual text is wrong.
 */
function isBlankOrNumber(value: string): boolean {
  return value.trim() === '' || isValidAmount(value)
}

function orZero(value: string): string {
  return value.trim() === '' ? '0' : value
}
