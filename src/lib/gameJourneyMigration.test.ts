import { describe, expect, it } from 'vitest'
import type { Game, LogEntry } from '../types'
import {
  initialJourneyIdForGame,
  migrateLegacyGame,
  migrateLegacyLibrary,
} from './gameJourneyMigration'

function makeLegacyGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'persona-5-royal',
    title: 'Persona 5 Royal',
    status: 'finished',
    rating: 10,
    playTimeHours: 126,
    review: 'A treasured journey.',
    platform: 'Switch',
    ownershipType: 'physical',
    tags: ['JRPG', 'JRPG', ' Narrative '],
    igdbId: 11111,
    igdbUrl: 'https://igdb.example/game',
    igdbTtbHastilySeconds: 100,
    igdbTtbNormallySeconds: 200,
    igdbTtbCompletelySeconds: 300,
    igdbTtbCount: 10,
    igdbTtbUpdatedAt: '2026-01-02T00:00:00.000Z',
    igdbDevelopers: ['Fallback Developer'],
    igdbPublishers: ['Fallback Publisher'],
    igdbThemes: ['Drama'],
    igdbGameModes: ['Single player'],
    releaseYear: 2019,
    priority: 'high-interest',
    developer: 'Manual Developer, Inc.',
    publisher: 'Manual Publisher',
    finishedAt: '2026-01-03',
    pausedAt: null,
    nudgeAt: null,
    createdAt: '2025-12-01T00:00:00.000Z',
    coverUrl: 'https://example.test/cover.webp',
    updatedAt: '2026-01-03T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

function makeLegacyLog(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'log-1',
    gameId: 'persona-5-royal',
    content: 'The finale landed.',
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

describe('initialJourneyIdForGame', () => {
  it('returns the same namespaced id for independently migrated copies', () => {
    expect(initialJourneyIdForGame('game-123')).toBe('game-123:initial-journey')
    expect(initialJourneyIdForGame('game-123')).toBe(initialJourneyIdForGame('game-123'))
  })
})

describe('legacy Game + Journey migration', () => {
  it('moves personal play data into an initial Journey and logs into that Journey', () => {
    const migration = migrateLegacyLibrary([makeLegacyGame()], [makeLegacyLog()])

    expect(migration.journeys).toEqual([
      expect.objectContaining({
        id: 'persona-5-royal:initial-journey',
        gameId: 'persona-5-royal',
        status: 'finished',
        platform: 'Switch',
        rating: 10,
        review: 'A treasured journey.',
        playTimeHours: 126,
        startedAt: null,
        finishedAt: '2026-01-03',
      }),
    ])
    expect(migration.logs).toEqual([
      expect.objectContaining({
        id: 'log-1',
        journeyId: 'persona-5-royal:initial-journey',
      }),
    ])
  })

  it('preserves canonical metadata while intentionally discarding IGDB cache fields', () => {
    const game = migrateLegacyGame(makeLegacyGame())

    expect(game).toEqual({
      id: 'persona-5-royal',
      title: 'Persona 5 Royal',
      releaseYear: 2019,
      developers: ['Manual Developer, Inc.'],
      publishers: ['Manual Publisher'],
      genres: [],
      themes: [],
      gameModes: [],
      tags: ['JRPG', 'Narrative'],
      cover: {
        url: 'https://example.test/cover.webp',
        source: { provider: 'manual', pageUrl: null },
      },
      externalReferences: [],
      playtimeEstimates: null,
      metadataReviewedAt: null,
      createdAt: '2025-12-01T00:00:00.000Z',
      updatedAt: '2026-01-03T00:00:00.000Z',
      deletedAt: null,
    })
    expect(game).not.toHaveProperty('igdbId')
    expect(game).not.toHaveProperty('status')
  })

  it('uses visible IGDB credit arrays only when manual credits are missing', () => {
    const game = migrateLegacyGame(makeLegacyGame({
      developer: null,
      publisher: ' ',
      igdbDevelopers: ['Fallback Developer', 'Fallback Developer'],
      igdbPublishers: ['Fallback Publisher'],
    }))

    expect(game.developers).toEqual(['Fallback Developer'])
    expect(game.publishers).toEqual(['Fallback Publisher'])
  })

  it('preserves paused dates and tombstones on the initial Journey', () => {
    const migration = migrateLegacyLibrary([
      makeLegacyGame({
        id: 'paused',
        status: 'paused',
        pausedAt: '2026-02-01',
        nudgeAt: '2026-02-15',
      }),
      makeLegacyGame({
        id: 'deleted',
        deletedAt: '2026-03-01T00:00:00.000Z',
      }),
    ], [
      makeLegacyLog({
        id: 'deleted-log',
        gameId: 'deleted',
        deletedAt: '2026-03-01T00:00:00.000Z',
      }),
    ])

    expect(migration.journeys.find((journey) => journey.id === 'paused:initial-journey'))
      .toMatchObject({ pausedAt: '2026-02-01', nudgeAt: '2026-02-15' })
    expect(migration.games.find((game) => game.id === 'deleted')?.deletedAt)
      .toBe('2026-03-01T00:00:00.000Z')
    expect(migration.journeys.find((journey) => journey.id === 'deleted:initial-journey')?.deletedAt)
      .toBe('2026-03-01T00:00:00.000Z')
    expect(migration.logs[0].deletedAt).toBe('2026-03-01T00:00:00.000Z')
  })

  it('rejects orphaned legacy logs instead of silently losing ownership', () => {
    expect(() => migrateLegacyLibrary([], [makeLegacyLog()])).toThrow(/without its game/i)
  })
})
