import { describe, expect, it } from 'vitest'
import {
  getBacklogPressure,
  getPlatformMix,
  getPlayLogsOverTime,
  getStatusDistribution,
} from './statsAnalytics'
import type { Game, JourneyLogEntry } from '../types'

function game(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game',
    title: 'Game',
    status: 'backlog',
    rating: null,
    playTimeHours: null,
    review: '',
    platform: '',
    ownershipType: null,
    tags: [],
    finishedAt: null,
    pausedAt: null,
    nudgeAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

function log(overrides: Partial<JourneyLogEntry> = {}): JourneyLogEntry {
  return {
    id: 'log',
    journeyId: 'journey',
    content: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

describe('statsAnalytics', () => {
  it('builds status and platform distributions from visible games', () => {
    const games = [
      game({ id: 'a', status: 'backlog', platform: 'Switch' }),
      game({ id: 'b', status: 'finished', platform: 'Switch' }),
      game({ id: 'c', status: 'finished', platform: 'PC' }),
      game({ id: 'deleted', status: 'paused', platform: 'PC', deletedAt: '2026-01-02T00:00:00.000Z' }),
    ]

    expect(getStatusDistribution(games)).toEqual([
      { label: 'backlog', value: 1 },
      { label: 'finished', value: 2 },
    ])
    expect(getPlatformMix(games)).toEqual([
      { label: 'Switch', value: 2 },
      { label: 'PC', value: 1 },
    ])
  })

  it('builds backlog pressure and journal activity series', () => {
    expect(getBacklogPressure([
      game({ id: 'a', status: 'backlog' }),
      game({ id: 'b', status: 'playing' }),
      game({ id: 'c', status: 'ongoing' }),
      game({ id: 'd', status: 'finished' }),
      game({ id: 'deleted', status: 'finished', deletedAt: '2026-01-02T00:00:00.000Z' }),
    ])).toEqual([
      { label: 'backlog', value: 1 },
      { label: 'active', value: 2 },
      { label: 'finished', value: 1 },
    ])

    expect(getPlayLogsOverTime([
      log({ id: 'a', createdAt: '2026-01-05T00:00:00.000Z' }),
      log({ id: 'b', createdAt: '2026-01-06T00:00:00.000Z' }),
      log({ id: 'c', createdAt: '2026-02-06T00:00:00.000Z' }),
    ])).toEqual([
      { label: '2026-01', value: 2 },
      { label: '2026-02', value: 1 },
    ])
  })
})
