import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import type { LogEntry } from '../types'
import { BacklogDatabase } from './backlogDb'
import type { LegacyGame } from './gameJourneyMigration'

const databaseNames: string[] = []

function makeLegacyGame(overrides: Partial<LegacyGame> = {}): LegacyGame {
  return {
    id: 'legacy-game',
    title: 'Legacy Game',
    status: 'finished',
    rating: 9,
    playTimeHours: 42,
    review: 'Still wonderful.',
    platform: 'Switch',
    ownershipType: 'physical',
    tags: ['JRPG'],
    igdbId: 123,
    igdbDevelopers: ['Fallback Developer'],
    igdbPublishers: ['Fallback Publisher'],
    releaseYear: 2024,
    priority: 'high-interest',
    developer: 'Manual Developer',
    publisher: null,
    finishedAt: '2026-05-01',
    pausedAt: null,
    nudgeAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    coverUrl: 'https://example.test/cover.webp',
    updatedAt: '2026-05-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

function makeLegacyLog(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'legacy-log',
    gameId: 'legacy-game',
    content: 'A legacy note.',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)))
})

describe('IndexedDB v7 Game + Journey migration', () => {
  it('transactionally replaces legacy Game and Log rows with canonical entities', async () => {
    const databaseName = `miolog-v7-migration-${crypto.randomUUID()}`
    databaseNames.push(databaseName)
    const legacyDb = new Dexie(databaseName)
    legacyDb.version(6).stores({
      games: 'id, updatedAt, status, title, finishedAt, deletedAt',
      logs: 'id, gameId, createdAt, updatedAt, deletedAt',
      earnedTrophies: 'id, trophyId, earnedAt, updatedAt, deletedAt',
    })
    await legacyDb.open()
    await legacyDb.table('games').put(makeLegacyGame())
    await legacyDb.table('logs').put(makeLegacyLog())
    legacyDb.close()

    const migratedDb = new BacklogDatabase(databaseName)
    await migratedDb.open()

    expect(await migratedDb.games.toArray()).toEqual([
      expect.objectContaining({
        id: 'legacy-game',
        title: 'Legacy Game',
        developers: ['Manual Developer'],
        publishers: [],
        cover: {
          url: 'https://example.test/cover.webp',
          source: { provider: 'manual', pageUrl: null },
        },
      }),
    ])
    expect(await migratedDb.journeys.toArray()).toEqual([
      expect.objectContaining({
        id: 'legacy-game:initial-journey',
        gameId: 'legacy-game',
        status: 'finished',
        rating: 9,
        review: 'Still wonderful.',
      }),
    ])
    expect(await migratedDb.logs.toArray()).toEqual([
      expect.objectContaining({
        id: 'legacy-log',
        journeyId: 'legacy-game:initial-journey',
        content: 'A legacy note.',
      }),
    ])
    expect(migratedDb.games.schema.indexes.map((index) => index.name)).not.toContain('status')
    expect(migratedDb.logs.schema.indexes.map((index) => index.name)).toContain('journeyId')

    migratedDb.close()
  })
})
