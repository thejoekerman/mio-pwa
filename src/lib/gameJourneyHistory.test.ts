import { describe, expect, it } from 'vitest'
import { getLifetimePlayTime, groupJourneyLogs } from './gameJourneyHistory'
import type { Journey, JourneyLogEntry } from '../types'

function journey(id: string, playTimeHours: number | null): Journey {
  return {
    id,
    gameId: 'game',
    status: 'finished',
    platform: '',
    ownershipType: null,
    priority: null,
    rating: null,
    review: '',
    playTimeHours,
    startedAt: null,
    finishedAt: null,
    pausedAt: null,
    nudgeAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  }
}

function log(id: string, journeyId: string, createdAt: string): JourneyLogEntry {
  return {
    id,
    journeyId,
    content: id,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  }
}

describe('game Journey history', () => {
  it('adds playtime across Journeys only when lifetime context is meaningful', () => {
    expect(getLifetimePlayTime([journey('only', 12)])).toBeNull()
    expect(getLifetimePlayTime([journey('first', 12.25), journey('replay', 4.26)])).toBe(16.5)
  })

  it('groups logs by Journey and orders each group newest first', () => {
    const first = journey('first', null)
    const replay = journey('replay', null)
    const groups = groupJourneyLogs(
      [replay, first],
      [
        log('old', 'first', '2026-01-01T00:00:00.000Z'),
        log('new', 'first', '2026-02-01T00:00:00.000Z'),
        log('replay-log', 'replay', '2026-03-01T00:00:00.000Z'),
      ],
    )

    expect(groups.map(({ journey: entry }) => entry.id)).toEqual(['replay', 'first'])
    expect(groups[1].logs.map((entry) => entry.id)).toEqual(['new', 'old'])
  })
})
