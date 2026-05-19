import { describe, it, expect } from 'vitest'
import { getSyncErrorMessage } from './syncUtils'

describe('getSyncErrorMessage', () => {
  it('returns the fallback for a TypeError (network failure)', () => {
    expect(getSyncErrorMessage(new TypeError('Failed to fetch'), 'sync failed')).toBe('sync failed')
  })

  it('returns the error message for a plain Error', () => {
    expect(getSyncErrorMessage(new Error('Unauthorized'), 'sync failed')).toBe('Unauthorized')
  })

  it('returns the fallback for a string thrown as error', () => {
    expect(getSyncErrorMessage('something went wrong', 'sync failed')).toBe('sync failed')
  })

  it('returns the fallback for null', () => {
    expect(getSyncErrorMessage(null, 'sync failed')).toBe('sync failed')
  })

  it('returns the fallback for an object', () => {
    expect(getSyncErrorMessage({ code: 500 }, 'sync failed')).toBe('sync failed')
  })

  it('uses whichever fallback key is passed', () => {
    expect(getSyncErrorMessage(new TypeError(), 'connection failed')).toBe('connection failed')
    expect(getSyncErrorMessage(new TypeError(), 'review draft failed')).toBe('review draft failed')
  })
})
