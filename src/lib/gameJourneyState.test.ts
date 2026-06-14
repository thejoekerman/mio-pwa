import { describe, expect, it } from 'vitest'
import type { Journey } from '../types'
import {
  getCurrentJourney,
  getGameDisplayStatus,
  hasActiveJourney,
} from './gameJourneyState'

function makeJourney(overrides: Partial<Journey> = {}): Journey {
  return {
    id: 'journey-1',
    gameId: 'game-1',
    status: 'backlog',
    platform: '',
    ownershipType: null,
    priority: null,
    rating: null,
    review: '',
    playTimeHours: null,
    startedAt: null,
    finishedAt: null,
    pausedAt: null,
    nudgeAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

describe('getCurrentJourney', () => {
  it('uses the shared active, paused, backlog, terminal precedence', () => {
    const journeys = [
      makeJourney({ id: 'finished', status: 'finished', updatedAt: '2026-06-01T00:00:00.000Z' }),
      makeJourney({ id: 'backlog', status: 'backlog', updatedAt: '2026-05-01T00:00:00.000Z' }),
      makeJourney({ id: 'paused', status: 'paused', updatedAt: '2026-04-01T00:00:00.000Z' }),
      makeJourney({ id: 'playing', status: 'playing', updatedAt: '2026-03-01T00:00:00.000Z' }),
    ]

    expect(getCurrentJourney(journeys)?.id).toBe('playing')
  })

  it('uses the most recently updated journey within a precedence group', () => {
    const journeys = [
      makeJourney({ id: 'playing-old', status: 'playing', updatedAt: '2026-03-01T00:00:00.000Z' }),
      makeJourney({ id: 'ongoing-new', status: 'ongoing', updatedAt: '2026-04-01T00:00:00.000Z' }),
    ]

    expect(getCurrentJourney(journeys)?.id).toBe('ongoing-new')
  })

  it('ignores tombstoned journeys', () => {
    const journeys = [
      makeJourney({
        id: 'deleted-playing',
        status: 'playing',
        deletedAt: '2026-06-01T00:00:00.000Z',
      }),
      makeJourney({ id: 'backlog', status: 'backlog' }),
    ]

    expect(getCurrentJourney(journeys)?.id).toBe('backlog')
  })
})

describe('getGameDisplayStatus', () => {
  it('derives Replaying when a finished Journey has a current active Journey', () => {
    const journeys = [
      makeJourney({ id: 'first', status: 'finished' }),
      makeJourney({ id: 'replay', status: 'playing', updatedAt: '2026-02-01T00:00:00.000Z' }),
    ]

    expect(getGameDisplayStatus(journeys)).toBe('replaying')
    expect(hasActiveJourney(journeys)).toBe(true)
  })

  it('keeps the first active Journey display status unchanged', () => {
    expect(getGameDisplayStatus([makeJourney({ status: 'playing' })])).toBe('playing')
  })

  it('does not call a paused Journey Replaying', () => {
    const journeys = [
      makeJourney({ id: 'first', status: 'finished' }),
      makeJourney({ id: 'replay', status: 'paused', updatedAt: '2026-02-01T00:00:00.000Z' }),
    ]

    expect(getGameDisplayStatus(journeys)).toBe('paused')
    expect(hasActiveJourney(journeys)).toBe(false)
  })
})
