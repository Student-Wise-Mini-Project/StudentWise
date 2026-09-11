import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'

import { server } from './server'

// `error` rather than `warn`: an unhandled request means a test is silently
// hitting a URL nobody stubbed, and passing anyway is worse than failing.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  cleanup()
  window.localStorage.clear()
})
afterAll(() => server.close())

// jsdom implements neither of these, and the app shell uses both: `matchMedia`
// for the mobile/desktop chrome switch and `IntersectionObserver` for the
// infinite-list sentinel. Without stubs every screen test throws on mount.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
})

class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds: ReadonlyArray<number> = []
  disconnect() {}
  observe() {}
  unobserve() {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
