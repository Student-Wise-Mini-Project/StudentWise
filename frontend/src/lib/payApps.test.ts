import { describe, expect, it } from 'vitest'

import { canPayWithApps, payAppLink } from './payApps'

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
const WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0'

describe('payAppLink', () => {
  it('sends an iPhone to the App Store, where "Open" launches the app', () => {
    expect(payAppLink('BIT', IPHONE, 5)).toBe('https://apps.apple.com/il/app/id1182007739')
    expect(payAppLink('PAYBOX', IPHONE, 5)).toBe('https://apps.apple.com/il/app/id895491053')
  })

  it('treats an iPad that claims to be a Mac as an iPad', () => {
    expect(payAppLink('BIT', IPAD_AS_MAC, 5)).toContain('apps.apple.com')
  })

  it('sends Android to Google Play, whatever the browser', () => {
    expect(payAppLink('BIT', ANDROID, 5)).toBe(
      'https://play.google.com/store/apps/details?id=com.bnhp.payments.paymentsapp',
    )
    expect(payAppLink('PAYBOX', ANDROID, 5)).toBe(
      'https://play.google.com/store/apps/details?id=com.payboxapp',
    )
  })

  it('offers nothing on a computer, where neither app runs', () => {
    expect(payAppLink('BIT', WINDOWS, 0)).toBeNull()
    expect(payAppLink('BIT', IPAD_AS_MAC, 0)).toBeNull() // a real Mac: no touch points
  })
})

describe('canPayWithApps', () => {
  it('only offers the apps for shekels', () => {
    expect(canPayWithApps('ILS')).toBe(true)
    expect(canPayWithApps('EUR')).toBe(false)
    expect(canPayWithApps('USD')).toBe(false)
  })
})
