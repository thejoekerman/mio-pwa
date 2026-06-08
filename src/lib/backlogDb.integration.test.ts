import { beforeEach, describe, expect, it } from 'vitest'
import {
  createBackupData,
  deleteGame,
  getAllEarnedTrophies,
  getAllCanonicalGames,
  getAllGames,
  getAllJourneyLogs,
  getAllJourneys,
  getAllLogs,
  getLogsForGame,
  importBackupData,
  replaceWithSyncSnapshot,
  saveEarnedTrophies,
  saveGame,
  saveLogEntry,
} from './backlogDb'
import type { EarnedTrophy, Game, LogEntry } from '../types'

// Integration tests for the Dexie persistence layer, running against real
// IndexedDB via fake-indexeddb (configured in vitest.setup.ts).
// These exercise round-trip data integrity, soft-delete (tombstone) semantics,
// the backup export/import field carve-outs, and ordering — paths the existing
// `backlogDb.test.ts` only covers at the `normalizeGame` level.

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    title: 'Game 1',
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

function makeLog(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'l1',
    gameId: 'g1',
    content: 'Log content',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

function makeTrophy(overrides: Partial<EarnedTrophy> = {}): EarnedTrophy {
  return {
    id: 't1',
    trophyId: 'first-game',
    earnedAt: '2026-01-01T00:00:00.000Z',
    gameId: null,
    context: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

describe('backlogDb (Dexie / fake-indexeddb)', () => {
  beforeEach(async () => {
    await replaceWithSyncSnapshot({ games: [], logs: [], earnedTrophies: [] })
  })

  describe('save + fetch round-trip', () => {
    it('saveGame then getAllGames returns the row unchanged', async () => {
      const game = makeGame({
        id: 'celeste',
        title: 'Celeste',
        rating: 9,
        playTimeHours: 27.5,
        tags: ['Platformer', 'Indie'],
        coverUrl: 'https://example.test/celeste.jpg',
      })
      await saveGame(game)

      const fetched = await getAllGames()

      expect(fetched).toHaveLength(1)
      expect(fetched[0]).toMatchObject({
        id: 'celeste',
        title: 'Celeste',
        rating: 9,
        playTimeHours: 27.5,
        tags: ['Platformer', 'Indie'],
        coverUrl: 'https://example.test/celeste.jpg',
      })

      expect(await getAllCanonicalGames()).toEqual([
        expect.objectContaining({
          id: 'celeste',
          title: 'Celeste',
          tags: ['Platformer', 'Indie'],
          cover: {
            url: 'https://example.test/celeste.jpg',
            source: { provider: 'manual', pageUrl: null },
          },
        }),
      ])
      expect(await getAllJourneys()).toEqual([
        expect.objectContaining({
          id: 'celeste:initial-journey',
          gameId: 'celeste',
          rating: 9,
          playTimeHours: 27.5,
        }),
      ])
    })

    it('returns games sorted by updatedAt descending', async () => {
      await saveGame(makeGame({ id: 'old', updatedAt: '2026-01-01T00:00:00.000Z' }))
      await saveGame(makeGame({ id: 'new', updatedAt: '2026-05-01T00:00:00.000Z' }))
      await saveGame(makeGame({ id: 'mid', updatedAt: '2026-03-01T00:00:00.000Z' }))

      const ids = (await getAllGames()).map((game) => game.id)
      expect(ids).toEqual(['new', 'mid', 'old'])
    })
  })

  describe('soft delete (tombstones)', () => {
    it('deleteGame hides the row from getAllGames() but keeps it visible to getAllGames(true)', async () => {
      await saveGame(makeGame({ id: 'gone' }))

      await deleteGame('gone')

      const visible = await getAllGames()
      const all = await getAllGames(true)
      expect(visible).toHaveLength(0)
      expect(all).toHaveLength(1)
      expect(all[0].deletedAt).toBeTruthy()
    })

    it('deleteGame also tombstones the game\'s logs (so they sync as deletions)', async () => {
      await saveGame(makeGame({ id: 'gone' }))
      await saveLogEntry(makeLog({ id: 'l1', gameId: 'gone' }))
      await saveLogEntry(makeLog({ id: 'l2', gameId: 'gone' }))

      await deleteGame('gone')

      const visibleLogs = await getAllLogs()
      const allLogs = await getAllLogs(true)
      expect(visibleLogs).toHaveLength(0)
      expect(allLogs).toHaveLength(2)
      expect(allLogs.every((log) => log.deletedAt !== null)).toBe(true)
    })

    it('deleteGame is a no-op when the game does not exist', async () => {
      await expect(deleteGame('nonexistent')).resolves.toBeUndefined()
      expect(await getAllGames(true)).toHaveLength(0)
    })
  })

  describe('getLogsForGame', () => {
    it('returns only non-deleted logs for the given game, newest first', async () => {
      await saveGame(makeGame({ id: 'g1' }))
      await saveGame(makeGame({ id: 'g2' }))
      await saveLogEntry(makeLog({ id: 'l1', gameId: 'g1', createdAt: '2026-01-01T00:00:00Z' }))
      await saveLogEntry(makeLog({ id: 'l2', gameId: 'g1', createdAt: '2026-02-01T00:00:00Z' }))
      await saveLogEntry(makeLog({ id: 'l3', gameId: 'g2', createdAt: '2026-03-01T00:00:00Z' }))
      await saveLogEntry(makeLog({ id: 'l4', gameId: 'g1', createdAt: '2026-04-01T00:00:00Z', deletedAt: '2026-04-02T00:00:00Z' }))

      const logs = await getLogsForGame('g1')
      const ids = logs.map((log) => log.id)
      expect(ids).toEqual(['l2', 'l1'])
    })
  })

  describe('createBackupData', () => {
    it('snapshots every table into a versioned payload', async () => {
      await saveGame(makeGame({ id: 'g1', title: 'A' }))
      await saveGame(makeGame({ id: 'g2', title: 'B' }))
      await saveLogEntry(makeLog({ id: 'l1', gameId: 'g1' }))
      await saveEarnedTrophies([makeTrophy({ id: 't1' })])

      const backup = await createBackupData()

      expect(backup.version).toBeGreaterThan(0)
      expect(backup.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(backup.games.map((g) => g.id).sort()).toEqual(['g1', 'g2'])
      expect(backup.journeys.map((journey) => journey.gameId).sort()).toEqual(['g1', 'g2'])
      expect(backup.logs.map((l) => l.id)).toEqual(['l1'])
      expect(backup.logs[0]).toHaveProperty('journeyId', 'g1:initial-journey')
      expect(backup.logs[0]).not.toHaveProperty('gameId')
      expect(backup.earnedTrophies?.map((t) => t.id)).toEqual(['t1'])
    })

    it('omits soft-deleted games from the backup (export is "what the user has now")', async () => {
      await saveGame(makeGame({ id: 'keep' }))
      await saveGame(makeGame({ id: 'gone' }))
      await deleteGame('gone')

      const backup = await createBackupData()

      expect(backup.games.map((g) => g.id)).toEqual(['keep'])
    })
  })

  describe('importBackupData', () => {
    it('replace mode wipes existing rows before writing the backup', async () => {
      await saveGame(makeGame({ id: 'existing', title: 'Existing' }))
      await saveLogEntry(makeLog({ id: 'el', gameId: 'existing' }))

      const result = await importBackupData(
        {
          version: 1,
          exportedAt: '2026-05-28T00:00:00Z',
          games: [makeGame({ id: 'imported', title: 'Imported' })],
          logs: [makeLog({ id: 'il', gameId: 'imported' })],
          earnedTrophies: [],
        },
        'replace',
      )

      const games = await getAllGames()
      const logs = await getAllLogs()
      expect(games.map((g) => g.id)).toEqual(['imported'])
      expect(logs.map((l) => l.id)).toEqual(['il'])
      expect(await getAllJourneys()).toEqual([
        expect.objectContaining({
          id: 'imported:initial-journey',
          gameId: 'imported',
        }),
      ])
      expect(await getAllJourneyLogs()).toEqual([
        expect.objectContaining({
          id: 'il',
          journeyId: 'imported:initial-journey',
        }),
      ])
      expect(result).toEqual({ games: 1, logs: 1, earnedTrophies: 0 })
    })

    it('merge mode keeps existing rows and adds new ones', async () => {
      await saveGame(makeGame({ id: 'existing', title: 'Existing' }))

      await importBackupData(
        {
          version: 1,
          exportedAt: '2026-05-28T00:00:00Z',
          games: [makeGame({ id: 'imported', title: 'Imported' })],
          logs: [],
          earnedTrophies: [],
        },
        'merge',
      )

      const ids = (await getAllGames()).map((g) => g.id).sort()
      expect(ids).toEqual(['existing', 'imported'])
    })

    it('merge mode overwrites a row when ids collide (last write wins by default)', async () => {
      await saveGame(makeGame({ id: 'g1', title: 'Local Version' }))

      await importBackupData(
        {
          version: 1,
          exportedAt: '2026-05-28T00:00:00Z',
          games: [makeGame({ id: 'g1', title: 'Backup Version' })],
          logs: [],
          earnedTrophies: [],
        },
        'merge',
      )

      const game = (await getAllGames())[0]
      expect(game.title).toBe('Backup Version')
    })

    it('rejects a payload that is not an object', async () => {
      await expect(importBackupData(null, 'replace')).rejects.toThrow(/not a valid object/i)
      await expect(importBackupData('string', 'replace')).rejects.toThrow(/not a valid object/i)
      await expect(importBackupData(42, 'replace')).rejects.toThrow(/not a valid object/i)
    })

    it('rejects a payload missing games or logs', async () => {
      await expect(
        importBackupData({ version: 1, exportedAt: '', games: [{ id: 'g1' }] }, 'replace'),
      ).rejects.toThrow(/missing games or logs/i)
    })

    it('treats earnedTrophies as optional (backup-format pre-trophies)', async () => {
      const result = await importBackupData(
        {
          version: 1,
          exportedAt: '2026-05-28T00:00:00Z',
          games: [makeGame()],
          logs: [],
          // no earnedTrophies field
        },
        'replace',
      )

      expect(result).toEqual({ games: 1, logs: 0, earnedTrophies: 0 })
      expect(await getAllEarnedTrophies()).toHaveLength(0)
    })

    it('dedupes records that share an id within the payload', async () => {
      await importBackupData(
        {
          version: 1,
          exportedAt: '2026-05-28T00:00:00Z',
          games: [
            makeGame({ id: 'dup', title: 'First' }),
            makeGame({ id: 'dup', title: 'Second (kept)' }),
          ],
          logs: [],
          earnedTrophies: [],
        },
        'replace',
      )

      const games = await getAllGames()
      expect(games).toHaveLength(1)
    })

    it('round-trips a canonical 3.0 backup without flattening Journey ownership', async () => {
      await saveGame(makeGame({ id: 'g1', title: 'Canonical' }))
      await saveLogEntry(makeLog({ id: 'l1', gameId: 'g1' }))
      const backup = await createBackupData()

      await importBackupData(backup, 'replace')

      expect(await getAllCanonicalGames()).toEqual(backup.games)
      expect(await getAllJourneys()).toEqual(backup.journeys)
      expect(await getAllJourneyLogs()).toEqual(backup.logs)
    })

    it('rejects orphaned canonical entities before replacing existing data', async () => {
      await saveGame(makeGame({ id: 'keep', title: 'Keep me' }))
      const backup = await createBackupData()

      await expect(importBackupData({
        ...backup,
        journeys: [{ ...backup.journeys[0], gameId: 'missing' }],
      }, 'replace')).rejects.toThrow(/no matching game/i)

      expect((await getAllGames()).map((game) => game.id)).toEqual(['keep'])
    })
  })

  describe('replaceWithSyncSnapshot field carve-out', () => {
    it('preserves locally-set developer/publisher/releaseYear/priority when the server returns null for them', async () => {
      // This is the carve-out tested at the composable level in
      // sync.integration.test.ts — here we hit it directly at the lib boundary
      // to lock in the lower-level contract.
      await saveGame(
        makeGame({
          id: 'tunic',
          developer: 'Andrew Shouldice',
          publisher: 'Finji',
          releaseYear: 2022,
          priority: 'high-interest',
        }),
      )

      await replaceWithSyncSnapshot({
        games: [
          makeGame({
            id: 'tunic',
            developer: null,
            publisher: null,
            releaseYear: null,
            priority: null,
          }),
        ],
        logs: [],
        earnedTrophies: [],
      })

      const stored = (await getAllGames())[0]
      expect(stored.developer).toBe('Andrew Shouldice')
      expect(stored.publisher).toBe('Finji')
      expect(stored.releaseYear).toBe(2022)
      expect(stored.priority).toBe('high-interest')
    })

    it('does NOT preserve other fields — coverUrl from the server response wins (or null wipes)', async () => {
      // The carve-out is intentionally narrow: cover/igdb metadata follow the
      // server. Locking this in so a well-meaning future widening doesn't silently
      // grow into "preserve everything" (which would break sync correctness).
      await saveGame(makeGame({ id: 'g1', coverUrl: 'https://local.test/cover.jpg' }))

      await replaceWithSyncSnapshot({
        games: [makeGame({ id: 'g1', coverUrl: null })],
        logs: [],
        earnedTrophies: [],
      })

      const stored = (await getAllGames())[0]
      expect(stored.coverUrl).toBeNull()
    })
  })
})
