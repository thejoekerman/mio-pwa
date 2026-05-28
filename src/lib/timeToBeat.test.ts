import { describe, expect, it } from 'vitest'
import { getTimeToBeatHours } from './timeToBeat'
import type { Game } from '../types'

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g',
    title: '',
    status: 'backlog',
    rating: null,
    playTimeHours: null,
    review: '',
    platform: '',
    ownershipType: null,
    tags: [],
    igdbId: null,
    finishedAt: null,
    pausedAt: null,
    nudgeAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

describe('getTimeToBeatHours', () => {
  it('returns null when no TTB seconds are set', () => {
    expect(getTimeToBeatHours(makeGame())).toBeNull()
  })

  it('prefers the "normally" duration when it is set', () => {
    const game = makeGame({
      igdbTtbHastilySeconds: 3600,
      igdbTtbNormallySeconds: 18000, // 5h
      igdbTtbCompletelySeconds: 36000,
    })
    expect(getTimeToBeatHours(game)).toBe(5)
  })

  it('rounds short durations to the nearest half hour', () => {
    // 1h 12m = 4320s → 1.2h → rounded to 1 (nearest 0.5)
    expect(getTimeToBeatHours(makeGame({ igdbTtbNormallySeconds: 4320 }))).toBe(1)
    // 2h 45m = 9900s → 2.75h → rounded up to 3 (Math.round(2.75 * 2) / 2 = 3)
    expect(getTimeToBeatHours(makeGame({ igdbTtbNormallySeconds: 9900 }))).toBe(3)
  })

  it('rounds longer durations to the nearest hour (>= 10h)', () => {
    // 12h 30m → 12.5h → at boundary, Math.round rounds to 13
    expect(getTimeToBeatHours(makeGame({ igdbTtbNormallySeconds: 12.5 * 3600 }))).toBe(13)
    // 50h 20m → 50.333h → rounded to 50
    expect(getTimeToBeatHours(makeGame({ igdbTtbNormallySeconds: 50.333 * 3600 }))).toBe(50)
  })

  it('falls back to the median of available durations when normally is missing', () => {
    // hastily=2h, completely=10h, no normally → median = 6h
    const game = makeGame({
      igdbTtbHastilySeconds: 2 * 3600,
      igdbTtbNormallySeconds: null,
      igdbTtbCompletelySeconds: 10 * 3600,
    })
    expect(getTimeToBeatHours(game)).toBe(6)
  })

  it('ignores non-positive or non-finite values in the median fallback', () => {
    // hastily=0 is filtered out; completely=4h alone → median = 4h
    const game = makeGame({
      igdbTtbHastilySeconds: 0,
      igdbTtbNormallySeconds: null,
      igdbTtbCompletelySeconds: 4 * 3600,
    })
    expect(getTimeToBeatHours(game)).toBe(4)
  })
})
