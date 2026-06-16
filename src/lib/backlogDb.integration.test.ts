import { beforeEach, describe, expect, it } from 'vitest'
import {
  createBackupData,
  createSyncRequest,
  deleteGame,
  deleteJourney,
  getAllEarnedTrophies,
  getAllCanonicalGames,
  getAllGames,
  getAllJourneyLogs,
  getAllJourneys,
  getAllLogs,
  getLogsForGame,
  getLogsForJourney,
  importBackupData,
  applySyncResponse,
  saveEarnedTrophies,
  saveGame,
  saveGameMetadata,
  saveJourney,
  saveLogEntry,
  saveLogEntryForJourney,
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
    await importBackupData({ games: [], journeys: [], logs: [], earnedTrophies: [] }, 'replace')
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

    it('saveJourney preserves the finished Journey and makes a replay current', async () => {
      await saveGame(makeGame({
        id: 'replay',
        status: 'finished',
        rating: 10,
        review: 'First run',
        finishedAt: '2026-05-01',
      }))

      await saveJourney({
        id: 'replay-2',
        gameId: 'replay',
        status: 'playing',
        platform: 'PS5',
        ownershipType: 'digital',
        priority: null,
        rating: null,
        review: '',
        playTimeHours: null,
        startedAt: '2026-06-08',
        finishedAt: null,
        pausedAt: null,
        nudgeAt: null,
        createdAt: '2026-06-08T00:00:00.000Z',
        updatedAt: '2026-06-08T00:00:00.000Z',
        deletedAt: null,
      })

      expect(await getAllJourneys()).toEqual([
        expect.objectContaining({ id: 'replay-2', status: 'playing' }),
        expect.objectContaining({ id: 'replay:initial-journey', status: 'finished', rating: 10 }),
      ])
      expect(await getAllGames()).toEqual([
        expect.objectContaining({
          id: 'replay',
          status: 'playing',
          platform: 'PS5',
          rating: null,
          finishedAt: null,
        }),
      ])
    })

    it('saveGameMetadata leaves Journey history untouched', async () => {
      const game = makeGame({ id: 'metadata', status: 'finished', review: 'First run' })
      await saveGame(game)
      await saveJourney({
        ...(await getAllJourneys())[0],
        id: 'metadata-replay',
        status: 'playing',
        review: '',
      })
      const journeysBefore = await getAllJourneys()

      await saveGameMetadata({ ...game, title: 'Updated title', tags: ['Updated'] })

      expect(await getAllJourneys()).toEqual(journeysBefore)
      expect(await getAllGames()).toEqual([
        expect.objectContaining({ title: 'Updated title', tags: ['Updated'], status: 'playing' }),
      ])
    })

    it('persists an explicitly selected Wikidata identity for new and existing Games', async () => {
      const wikidataReference = {
        provider: 'wikidata' as const,
        externalId: 'Q123',
        url: 'https://www.wikidata.org/wiki/Q123',
      }
      const game = makeGame({
        id: 'metadata-identity',
        externalReferences: [wikidataReference],
        metadataReviewedAt: '2026-06-11T00:00:00.000Z',
      })

      await saveGame(game)
      expect(await getAllCanonicalGames()).toEqual([
        expect.objectContaining({
          externalReferences: [wikidataReference],
          metadataReviewedAt: '2026-06-11T00:00:00.000Z',
        }),
      ])

      await saveGameMetadata({
        ...game,
        externalReferences: [{
          provider: 'wikidata',
          externalId: 'Q456',
          url: 'https://www.wikidata.org/wiki/Q456',
        }],
        metadataReviewedAt: '2026-06-11T01:00:00.000Z',
      })

      expect(await getAllCanonicalGames()).toEqual([
        expect.objectContaining({
          externalReferences: [expect.objectContaining({ externalId: 'Q456' })],
          metadataReviewedAt: '2026-06-11T01:00:00.000Z',
        }),
      ])
    })

    it('persists an applied Wikipedia cover with its source page', async () => {
      await saveGame(makeGame({
        id: 'wikipedia-cover',
        coverUrl: 'https://upload.wikimedia.org/cover.png',
        coverSource: {
          provider: 'wikipedia',
          pageUrl: 'https://en.wikipedia.org/wiki/Game',
        },
      }))

      expect(await getAllCanonicalGames()).toEqual([
        expect.objectContaining({
          cover: {
            url: 'https://upload.wikimedia.org/cover.png',
            source: {
              provider: 'wikipedia',
              pageUrl: 'https://en.wikipedia.org/wiki/Game',
            },
          },
        }),
      ])
    })

    it('saveGame updates only the current Journey and preserves previous Journeys', async () => {
      await saveGame(makeGame({
        id: 'csv-update',
        status: 'finished',
        rating: 10,
        review: 'First run',
        playTimeHours: 30,
        finishedAt: '2026-05-01',
      }))
      await saveJourney({
        id: 'csv-update-replay',
        gameId: 'csv-update',
        status: 'playing',
        platform: 'PC',
        ownershipType: null,
        priority: null,
        rating: null,
        review: '',
        playTimeHours: 5,
        startedAt: '2026-06-01',
        finishedAt: null,
        pausedAt: null,
        nudgeAt: null,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
        deletedAt: null,
      })

      const projectedCurrent = (await getAllGames())[0]
      await saveGame({
        ...projectedCurrent,
        title: 'Renamed by CSV',
        status: 'paused',
        platform: 'Steam Deck',
        playTimeHours: 8,
        updatedAt: '2026-06-02T00:00:00.000Z',
      })

      expect(await getAllJourneys()).toEqual([
        expect.objectContaining({
          id: 'csv-update-replay',
          status: 'paused',
          platform: 'Steam Deck',
          playTimeHours: 8,
        }),
        expect.objectContaining({
          id: 'csv-update:initial-journey',
          status: 'finished',
          rating: 10,
          review: 'First run',
          playTimeHours: 30,
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

    it('hard-deletes games immediately for local-only libraries', async () => {
      await saveGame(makeGame({ id: 'local-only' }))
      await saveLogEntry(makeLog({ id: 'local-log', gameId: 'local-only' }))

      await deleteGame('local-only', true)

      expect(await getAllCanonicalGames(true)).toEqual([])
      expect(await getAllJourneys(true)).toEqual([])
      expect(await getAllJourneyLogs(true)).toEqual([])
      expect((await createSyncRequest('server|user:1')).request.changes.games).toEqual([])
    })

    it('deleteJourney tombstones the Journey and its logs but preserves the Game', async () => {
      await saveGame(makeGame({ id: 'journey-delete' }))
      await saveJourney({
        ...(await getAllJourneys())[0],
        id: 'journey-delete-replay',
      })
      await saveLogEntryForJourney(
        makeLog({ id: 'journey-delete-log', gameId: 'journey-delete' }),
        'journey-delete-replay',
      )

      await deleteJourney('journey-delete-replay')

      expect(await getAllGames()).toHaveLength(1)
      expect((await getAllJourneys()).map((journey) => journey.id)).toEqual([
        'journey-delete:initial-journey',
      ])
      expect(await getAllJourneyLogs()).toEqual([])
      expect(await getAllJourneys(true)).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'journey-delete-replay', deletedAt: expect.any(String) }),
      ]))
      expect(await getAllJourneyLogs(true)).toEqual([
        expect.objectContaining({ id: 'journey-delete-log', deletedAt: expect.any(String) }),
      ])
    })

    it('deleteJourney refuses to tombstone the final visible Journey', async () => {
      await saveGame(makeGame({ id: 'journey-keep' }))

      await expect(deleteJourney('journey-keep:initial-journey')).resolves.toBe(false)

      expect(await getAllGames()).toHaveLength(1)
      expect(await getAllJourneys()).toEqual([
        expect.objectContaining({ id: 'journey-keep:initial-journey', deletedAt: null }),
      ])
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

    it('keeps logs separated by Journey', async () => {
      await saveGame(makeGame({ id: 'replay', status: 'finished' }))
      await saveJourney({
        ...(await getAllJourneys())[0],
        id: 'replay-2',
        status: 'playing',
        startedAt: '2026-06-08',
        finishedAt: null,
        createdAt: '2026-06-08T00:00:00.000Z',
        updatedAt: '2026-06-08T00:00:00.000Z',
      })

      await saveLogEntryForJourney(makeLog({ id: 'first-run', gameId: 'replay' }), 'replay:initial-journey')
      await saveLogEntryForJourney(makeLog({ id: 'replay-run', gameId: 'replay' }), 'replay-2')

      expect((await getLogsForJourney('replay:initial-journey')).map((log) => log.id)).toEqual(['first-run'])
      expect((await getLogsForJourney('replay-2')).map((log) => log.id)).toEqual(['replay-run'])
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
    it('keeps only the selected cover from legacy enrichment data', async () => {
      await importBackupData(
        {
          version: 1,
          exportedAt: '2026-05-28T00:00:00Z',
          games: [{
            ...makeGame({ id: 'legacy-enriched', coverUrl: 'https://example.test/selected-cover.jpg' }),
            igdbId: 123,
            igdbUrl: 'https://igdb.example/game',
            igdbDevelopers: ['Enriched Developer'],
            igdbPublishers: ['Enriched Publisher'],
            igdbTtbNormallySeconds: 36000,
          }],
          logs: [],
          earnedTrophies: [],
        },
        'replace',
      )

      expect(await getAllCanonicalGames()).toEqual([
        expect.objectContaining({
          id: 'legacy-enriched',
          cover: {
            url: 'https://example.test/selected-cover.jpg',
            source: { provider: 'manual', pageUrl: null },
          },
          developers: [],
          publishers: [],
          playtimeEstimates: null,
        }),
      ])
    })

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

  describe('incremental sync persistence', () => {
    it('queues local writes and clears only the acknowledged submitted revision', async () => {
      await saveGame(makeGame({ id: 'queued' }))
      const first = await createSyncRequest('server|user:1')
      const submittedJourney = first.submitted.find(({ entity }) => entity === 'journey')
      const [journey] = await getAllJourneys()
      await saveJourney({ ...journey, status: 'playing', updatedAt: '2026-02-01T00:00:00.000Z' })

      await applySyncResponse('server|user:1', first.submitted, {
        cursor: 1,
        acknowledged: {
          games: first.request.changes.games.map(({ id }) => id),
          journeys: first.request.changes.journeys.map(({ id }) => id),
          logs: [],
          earnedTrophies: [],
        },
        changes: first.request.changes,
        totals: { games: 1, journeys: 1, logs: 0 },
        syncedAt: '2026-02-01T00:00:00.000Z',
      })

      const next = await createSyncRequest('server|user:1')
      expect(submittedJourney).toBeDefined()
      expect(next.request.full).toBe(false)
      expect(next.request.cursor).toBe(1)
      expect(next.request.changes.games).toEqual([])
      expect(next.request.changes.journeys).toHaveLength(1)
      expect(next.request.changes.journeys[0].status).toBe('playing')
    })

    it('forces a full reconciliation when the authenticated server identity changes', async () => {
      await saveGame(makeGame({ id: 'identity' }))
      const first = await createSyncRequest('server|user:1')
      await applySyncResponse('server|user:1', first.submitted, {
        cursor: 4,
        acknowledged: {
          games: first.request.changes.games.map(({ id }) => id),
          journeys: first.request.changes.journeys.map(({ id }) => id),
          logs: [],
          earnedTrophies: [],
        },
        changes: first.request.changes,
        totals: { games: 1, journeys: 1, logs: 0 },
        syncedAt: '2026-02-01T00:00:00.000Z',
      })

      const changedIdentity = await createSyncRequest('server|user:2')
      expect(changedIdentity.request.full).toBe(true)
      expect(changedIdentity.request.cursor).toBeNull()
      expect(changedIdentity.request.changes.games).toHaveLength(1)
      expect(changedIdentity.request.changes.journeys).toHaveLength(1)
    })

    it('hard-deletes local tombstones after the server acknowledges compact deletion markers', async () => {
      await saveGame(makeGame({ id: 'delete-after-sync' }))
      await deleteGame('delete-after-sync')
      const prepared = await createSyncRequest('server|user:1')
      const deletedAt = prepared.request.changes.games[0].updatedAt

      await applySyncResponse('server|user:1', prepared.submitted, {
        cursor: 5,
        acknowledged: {
          games: ['delete-after-sync'],
          journeys: prepared.request.changes.journeys.map(({ id }) => id),
          logs: [],
          earnedTrophies: [],
        },
        changes: { games: [], journeys: [], logs: [], earnedTrophies: [] },
        deletions: {
          games: [{ id: 'delete-after-sync', updatedAt: deletedAt }],
          journeys: prepared.request.changes.journeys.map(({ id, updatedAt }) => ({ id, updatedAt })),
          logs: [],
          earnedTrophies: [],
        },
        totals: { games: 0, journeys: 0, logs: 0 },
        syncedAt: '2026-02-01T00:00:00.000Z',
      })

      expect(await getAllCanonicalGames(true)).toEqual([])
      expect(await getAllJourneys(true)).toEqual([])
      expect((await createSyncRequest('server|user:1')).request.changes.games).toEqual([])
    })

    it('replaces stale local sync data when the server requires authoritative recovery', async () => {
      await saveGame(makeGame({ id: 'stale', title: 'Stale local' }))
      const first = await createSyncRequest('server|user:1')
      const serverGame = { ...first.request.changes.games[0], id: 'server-only', title: 'Server only' }
      const serverJourney = {
        ...first.request.changes.journeys[0],
        id: 'server-only:journey',
        gameId: 'server-only',
      }

      await applySyncResponse('server|user:1', first.submitted, {
        cursor: 20,
        recoveryRequired: true,
        acknowledged: { games: [], journeys: [], logs: [], earnedTrophies: [] },
        changes: {
          games: [serverGame],
          journeys: [serverJourney],
          logs: [],
          earnedTrophies: [],
        },
        totals: { games: 1, journeys: 1, logs: 0 },
        syncedAt: '2026-02-01T00:00:00.000Z',
      })

      expect((await getAllCanonicalGames(true)).map(({ id }) => id)).toEqual(['server-only'])
      const next = await createSyncRequest('server|user:1')
      expect(next.request.full).toBe(false)
      expect(next.request.cursor).toBe(20)
      expect(next.request.changes).toEqual({ games: [], journeys: [], logs: [], earnedTrophies: [] })
    })
  })
})
