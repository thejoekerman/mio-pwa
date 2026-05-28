import { afterEach, describe, expect, it, vi } from 'vitest'
import { isOffline, isOnline } from './network'

describe('network', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns true when navigator.onLine is true', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    expect(isOnline()).toBe(true)
    expect(isOffline()).toBe(false)
  })

  it('returns false only when navigator.onLine is explicitly false', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    expect(isOnline()).toBe(false)
    expect(isOffline()).toBe(true)
  })

  it('defaults to "online" when navigator is undefined (SSR path)', () => {
    // Simulate a non-browser environment without removing the property type.
    vi.stubGlobal('navigator', undefined)
    expect(isOnline()).toBe(true)
  })
})
