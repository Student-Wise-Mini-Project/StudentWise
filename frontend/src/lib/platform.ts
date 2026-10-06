/**
 * Which platform and browser we are in, for the few places it genuinely matters.
 *
 * Sniffing the user agent is a bad habit, and these are the cases where there is
 * no feature to detect instead: `beforeinstallprompt` does not exist in Safari,
 * so "can this user install the app, and how" cannot be asked directly; and
 * whether Bit opens from the App Store or Google Play is a fact about the phone.
 */

/**
 * iOS or iPadOS, in any browser.
 *
 * **An iPad reports itself as a Macintosh.** Since iPadOS 13 the user agent says
 * `Macintosh; Intel Mac OS X`, and the only thing separating it from a real Mac
 * is that it has touch points.
 */
export function isIos(
  ua: string = navigator.userAgent,
  maxTouchPoints: number = navigator.maxTouchPoints,
): boolean {
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && maxTouchPoints > 1)
}

/** Any browser on Android. Where an app is opened from matters, not which browser. */
export function isAndroid(ua: string = navigator.userAgent): boolean {
  return /Android/.test(ua)
}

/**
 * iOS Safari, including iPadOS. Miss the iPad case above and every iPad user is
 * told nothing about how to install the app.
 *
 * Chrome, Firefox and Edge on iOS are all WebKit underneath but have their own
 * tokens, and their share sheets do not offer "Add to Home Screen", so they are
 * excluded.
 */
export function isIosSafari(
  ua: string = navigator.userAgent,
  maxTouchPoints: number = navigator.maxTouchPoints,
): boolean {
  if (!isIos(ua, maxTouchPoints)) return false

  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|Chrome/.test(ua)
  return /Safari/.test(ua) && !otherBrowser
}

/** Already installed and running without browser chrome. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const byMedia = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  // Safari's own non-standard flag, still the only reliable signal on iOS.
  const byLegacy = (navigator as { standalone?: boolean }).standalone === true
  return byMedia || byLegacy
}
