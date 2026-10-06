/**
 * Israeli mobile numbers, for paying people back with Bit or PayBox (7.3).
 *
 * The server is the authority -- it normalises whatever was typed to E.164 and
 * refuses anything that is not a mobile (`app/domain/phone.py`). This mirrors
 * that rule only so the form can say what is wrong *in the app's language*
 * before a round trip, and so a stored number reads the way Israelis write it.
 * `phone.test.ts` runs the same cases as the backend's `test_phone.py`.
 */

const SEPARATORS = /[\s\-.()/]/g
const NATIONAL_MOBILE = /^05\d{8}$/
const NATIONAL_LANDLINE = /^(0[234789]\d{7}|07\d{8})$/

export type PhoneProblem = 'empty' | 'notDigits' | 'landline' | 'invalid'

function national(digits: string): string {
  for (const prefix of ['+972', '00972', '972']) {
    if (digits.startsWith(prefix)) {
      const rest = digits.slice(prefix.length)
      return rest.startsWith('0') ? rest : `0${rest}`
    }
  }
  return digits
}

/** What is wrong with a typed number, or null when the server will accept it. */
export function phoneProblem(raw: string): PhoneProblem | null {
  const compact = raw.trim().replace(SEPARATORS, '')
  if (compact === '') return 'empty'
  if (!/^\+?\d+$/.test(compact)) return 'notDigits'
  const local = national(compact)
  if (NATIONAL_MOBILE.test(local)) return null
  if (NATIONAL_LANDLINE.test(local)) return 'landline'
  return 'invalid'
}

/**
 * `+972501234567` -> `050-123-4567`, the way it is written here and the way
 * Bit's own contact search wants it. Anything that is not a stored Israeli
 * mobile (an account from before 7.3 validated numbers) comes back as it was.
 */
export function formatPhone(stored: string): string {
  const match = /^\+9725(\d)(\d{3})(\d{4})$/.exec(stored)
  return match ? `05${match[1]}-${match[2]}-${match[3]}` : stored
}
