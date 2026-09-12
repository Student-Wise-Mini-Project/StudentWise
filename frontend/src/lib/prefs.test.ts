import { beforeEach, describe, expect, it, vi } from 'vitest'

import { readLastGroupId, rememberLastGroupId } from './prefs'

describe('the last group opened', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('is null before any group has been opened', () => {
    expect(readLastGroupId()).toBeNull()
  })

  it('survives a round trip', () => {
    rememberLastGroupId('abc-123')
    expect(readLastGroupId()).toBe('abc-123')
  })

  it('keeps only the most recent one', () => {
    rememberLastGroupId('first')
    rememberLastGroupId('second')
    expect(readLastGroupId()).toBe('second')
  })

  it('reads as null when the browser blocks site data', () => {
    // A private window, or a browser set to block storage. The picker falls
    // back to alphabetical rather than failing to open.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readLastGroupId()).toBeNull()
  })

  it('does not throw when the browser blocks writing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => rememberLastGroupId('abc-123')).not.toThrow()
  })
})
