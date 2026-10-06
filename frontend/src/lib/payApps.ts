/**
 * Getting someone from a planned transfer into Bit or PayBox (7.1).
 *
 * **Neither app publishes a link that opens a payment with a person and an
 * amount filled in.** Bit's developer API is for merchant checkouts and needs a
 * business account; PayBox has none. Undocumented URL schemes exist, but one
 * that changes in an app update fails silently on someone's phone, so this does
 * not use them. What is reliable is the app's own store page, which on a phone
 * opens the App Store or Google Play with an "Open" button when the app is
 * installed and "Get" when it is not. The person copies the number and the
 * amount from our sheet and pastes them in -- two taps more than a deep link,
 * and none of them can break.
 *
 * Store identifiers checked against the stores on 2026-10-06.
 */

import { isAndroid, isIos } from './platform'

export type PayApp = 'BIT' | 'PAYBOX'

export const PAY_APPS: readonly PayApp[] = ['BIT', 'PAYBOX']

const STORES: Record<PayApp, { appStore: string; googlePlay: string }> = {
  BIT: {
    appStore: 'https://apps.apple.com/il/app/id1182007739',
    googlePlay: 'https://play.google.com/store/apps/details?id=com.bnhp.payments.paymentsapp',
  },
  PAYBOX: {
    appStore: 'https://apps.apple.com/il/app/id895491053',
    googlePlay: 'https://play.google.com/store/apps/details?id=com.payboxapp',
  },
}

/**
 * Where "Open Bit" goes on this device, or null on a computer -- neither app
 * runs there, and a store page in a desktop browser is a dead end.
 */
export function payAppLink(app: PayApp, ua?: string, maxTouchPoints?: number): string | null {
  if (isIos(ua, maxTouchPoints)) return STORES[app].appStore
  if (isAndroid(ua)) return STORES[app].googlePlay
  return null
}

/**
 * Both apps pay in shekels only. Offering Bit on a group that keeps its books
 * in euros would send the right number in the wrong currency.
 */
export function canPayWithApps(currency: string): boolean {
  return currency === 'ILS'
}
