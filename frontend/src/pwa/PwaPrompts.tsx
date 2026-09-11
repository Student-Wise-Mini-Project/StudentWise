import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Stack } from '@/components/layout'
import { isIosSafari, isStandalone } from '@/lib/platform'
import { dismissIosHint, iosHintDismissed } from '@/lib/prefs'

/**
 * "A new version is ready."
 *
 * `registerType: 'prompt'` rather than auto-update, and this is why: an
 * auto-updating service worker can swap the app out while somebody is half way
 * through typing rent. The new version waits until they say so.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <Banner>
      <Stack direction="row" gap={3} className="items-center">
        <p className="flex-1 text-sm font-medium">A new version of StudentWise is ready.</p>
        <Button size="sm" variant="secondary" onClick={() => setNeedRefresh(false)}>
          Later
        </Button>
        <Button size="sm" onClick={() => void updateServiceWorker(true)}>
          Reload
        </Button>
      </Stack>
    </Banner>
  )
}

/**
 * The iOS install hint.
 *
 * **`beforeinstallprompt` does not fire in Safari.** There is no way to trigger
 * an install from script on iOS, so an "Install" button would be a control that
 * does nothing. The only honest option is to tell people where the system one
 * is, once, and let them dismiss it.
 */
export function IosInstallHint() {
  // Computed once during the first render rather than in an effect: the answer
  // never changes while the app is open, and setting state from an effect body
  // is a cascading render for no reason.
  const [show, setShow] = useState(() => !iosHintDismissed() && isIosSafari() && !isStandalone())

  if (!show) return null

  function dismiss() {
    setShow(false)
    dismissIosHint()
  }

  return (
    <Banner>
      <Stack gap={2}>
        <p className="text-sm font-semibold">Add StudentWise to your home screen</p>
        <p className="text-muted text-xs">
          Tap the Share button, then <strong>Add to Home Screen</strong>. It opens full screen and
          works without a signal.
        </p>
        <Button size="sm" variant="secondary" onClick={dismiss}>
          Got it
        </Button>
      </Stack>
    </Banner>
  )
}

/** Sits above the tab bar and clears the home indicator. */
function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-x-0 z-40 px-4"
      style={{
        insetBlockEnd: 'calc(var(--sw-tabbar-height) + var(--sw-safe-block-end) + 0.75rem)',
      }}
    >
      <Card className="shadow-float mx-auto max-w-md" elevated>
        {children}
      </Card>
    </div>
  )
}
