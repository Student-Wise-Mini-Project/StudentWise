import { describe, expect, it } from 'vitest'

import { isIosSafari } from './platform'

// Real user-agent strings, because the whole point of this function is that the
// real ones are not what you would guess.
const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipadOS:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  iosChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.108 Mobile/15E148 Safari/604.1',
  iosFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
}

describe('isIosSafari', () => {
  it('recognises an iPhone', () => {
    expect(isIosSafari(UA.iphoneSafari, 5)).toBe(true)
  })

  it('recognises an iPad, which claims to be a Macintosh', () => {
    // Since iPadOS 13 the user agent is identical to a desktop Mac's. Touch
    // points are the only thing that separates them, and missing this means
    // every iPad user is told nothing about how to install the app.
    expect(isIosSafari(UA.ipadOS, 5)).toBe(true)
  })

  it('does not mistake a real Mac for an iPad', () => {
    // Same string, no touch screen.
    expect(isIosSafari(UA.macSafari, 0)).toBe(false)
  })

  it('excludes other browsers on iOS, whose share sheet has no Add to Home Screen', () => {
    expect(isIosSafari(UA.iosChrome, 5)).toBe(false)
    expect(isIosSafari(UA.iosFirefox, 5)).toBe(false)
  })

  it('says no to Android and desktop', () => {
    expect(isIosSafari(UA.androidChrome, 5)).toBe(false)
    expect(isIosSafari(UA.desktopChrome, 0)).toBe(false)
  })
})
