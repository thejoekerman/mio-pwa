import { describe, expect, it } from 'vitest'
import { getFinishedJourneyEntries, getFinishedJourneyYears, projectJourneyGame } from './journeyAnalytics'
import type { Game, Journey } from '../types'

function makeGame(id: string): Game {
  return {
    id,
    title: id,
    status: 'playing',
    rating: null,
    playTimeHours: null,
    review: '',
    platform: '',
    ownershipType: null,
    tags: [],
    finishedAt: null,
    pausedAt: null,
    nudgeAt: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  }
}

function makeJourney(gameId: string, id: string, overrides: Partial<Journey> = {}): Journey {
  return {
    id,
    gameId,
    status: 'finished',
    platform: '',
    ownershipType: null,
    priority: null,
    rating: 9,
    review: '',
    playTimeHours: 10,
    startedAt: null,
    finishedAt: '2026-01-01',
    pausedAt: null,
    nudgeAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

describe('journeyAnalytics', () => {
  it('counts every finished Journey and labels later Journeys as replays', () => {
    const game = makeGame('game')
    const entries = getFinishedJourneyEntries(
      [game],
      [
        makeJourney(game.id, 'first', { createdAt: '2025-01-01T00:00:00.000Z' }),
        makeJourney(game.id, 'replay', { finishedAt: '2026-02-01', createdAt: '2026-01-01T00:00:00.000Z' }),
      ],
    )

    expect(entries).toHaveLength(2)
    expect(entries.map((entry) => [entry.journeyNumber, entry.isReplay])).toEqual([[1, false], [2, true]])
    expect(getFinishedJourneyYears(entries)).toEqual(['2026'])
  })

  it('projects Journey-specific personal fields onto stable Game metadata', () => {
    const game = makeGame('game')
    const entry = getFinishedJourneyEntries(
      [game],
      [makeJourney(game.id, 'finished', { platform: 'Switch', playTimeHours: 42 })],
    )[0]

    expect(projectJourneyGame(entry)).toMatchObject({
      id: game.id,
      title: game.title,
      platform: 'Switch',
      playTimeHours: 42,
      status: 'finished',
    })
  })
})
