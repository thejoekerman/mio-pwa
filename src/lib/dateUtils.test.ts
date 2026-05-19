import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isAtLeastDaysOld, getNextUpdatedAt } from './dateUtils'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date('2025-06-01T12:00:00.000Z').getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('isAtLeastDaysOld', () => {
  it('returns true for null (treat missing as old)', () => {
    expect(isAtLeastDaysOld(null, 7)).toBe(true)
  })

  it('returns true for an empty string', () => {
    expect(isAtLeastDaysOld('', 7)).toBe(true)
  })

  it('returns true for an invalid date string', () => {
    expect(isAtLeastDaysOld('not-a-date', 7)).toBe(true)
  })

  it('returns false when the date is more recent than the threshold', () => {
    const yesterday = new Date(NOW - DAY_MS).toISOString()
    expect(isAtLeastDaysOld(yesterday, 7)).toBe(false)
  })

  it('returns true when the date is exactly the threshold', () => {
    const sevenDaysAgo = new Date(NOW - 7 * DAY_MS).toISOString()
    expect(isAtLeastDaysOld(sevenDaysAgo, 7)).toBe(true)
  })

  it('returns true when the date is older than the threshold', () => {
    const tenDaysAgo = new Date(NOW - 10 * DAY_MS).toISOString()
    expect(isAtLeastDaysOld(tenDaysAgo, 7)).toBe(true)
  })

  it('handles a threshold of 0 days (always old)', () => {
    const justNow = new Date(NOW).toISOString()
    expect(isAtLeastDaysOld(justNow, 0)).toBe(true)
  })
})

describe('getNextUpdatedAt', () => {
  it('returns the current time when no previous value is given', () => {
    expect(getNextUpdatedAt()).toBe(new Date(NOW).toISOString())
  })

  it('returns the current time when previous is null', () => {
    expect(getNextUpdatedAt(null)).toBe(new Date(NOW).toISOString())
  })

  it('returns the current time when previous is in the past', () => {
    const yesterday = new Date(NOW - DAY_MS).toISOString()
    expect(getNextUpdatedAt(yesterday)).toBe(new Date(NOW).toISOString())
  })

  it('bumps by 1 second when previous is exactly now (clock tie)', () => {
    const exactlyNow = new Date(NOW).toISOString()
    expect(getNextUpdatedAt(exactlyNow)).toBe(new Date(NOW + 1000).toISOString())
  })

  it('bumps by 1 second when previous is in the future (clock skew)', () => {
    const future = new Date(NOW + 5000).toISOString()
    expect(getNextUpdatedAt(future)).toBe(new Date(NOW + 5000 + 1000).toISOString())
  })

  it('returns the current time for an invalid previous date', () => {
    expect(getNextUpdatedAt('not-a-date')).toBe(new Date(NOW).toISOString())
  })
})
