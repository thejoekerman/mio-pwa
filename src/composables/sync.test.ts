import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { reactive, ref } from 'vue'
import type {
  AppLanguage,
  AppTheme,
  EarnedTrophy,
  Game,
  GameFormState,
  LibraryViewMode,
  LogEntry,
  SyncResponse,
  SyncSnapshot,
} from '../types'
import type { AppSettingsState } from './useSettings'

// Mock the network boundary and the IndexedDB layer so the composable runs in
// total isolation — no real fetch, no Dexie, no MioServer.
vi.mock('../lib/backlogDb', () => ({
  createSyncSnapshot: vi.fn(),
  replaceWithSyncSnapshot: vi.fn(),
}))

vi.mock('../lib/syncApi', () => ({
  syncWithBackend: vi.fn(),
  testSyncConnection: vi.fn(),
}))

vi.mock('../lib/network', () => ({
  isOnline: () => true,
}))

vi.mock('../lib/appMode', () => ({
  isDemoMode: false,
  isDesktopMode: false,
  appDisplayName: 'MioLog',
}))

import { createSyncSnapshot, replaceWithSyncSnapshot } from '../lib/backlogDb'
import { syncWithBackend, testSyncConnection } from '../lib/syncApi'
import { createSyncHandlers } from './sync'

const createSyncSnapshotMock = createSyncSnapshot as unknown as Mock
const replaceWithSyncSnapshotMock = replaceWithSyncSnapshot as unknown as Mock
const syncWithBackendMock = syncWithBackend as unknown as Mock
const testSyncConnectionMock = testSyncConnection as unknown as Mock

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    title: 'Game 1',
    status: 'backlog',
    rating: null,
    playTimeHours: null,
    review: '',
    platform: '',
    ownershipType: null,
    tags: [],
    igdbId: null,
    igdbUrl: null,
    coverUrl: null,
    igdbTtbHastilySeconds: null,
    igdbTtbNormallySeconds: null,
    igdbTtbCompletelySeconds: null,
    igdbTtbCount: null,
    igdbTtbUpdatedAt: null,
    igdbDevelopers: null,
    igdbPublishers: null,
    igdbThemes: null,
    igdbGameModes: null,
    releaseYear: null,
    developer: null,
    publisher: null,
    priority: null,
    finishedAt: null,
    pausedAt: null,
    nudgeAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

function makeSnapshot(games: Game[] = [], logs: LogEntry[] = [], trophies: EarnedTrophy[] = []): SyncSnapshot {
  return { games, logs, earnedTrophies: trophies }
}

function makeResponse(snapshot: SyncSnapshot, syncedAt = '2026-05-28T12:00:00.000Z'): SyncResponse {
  return { ...snapshot, syncedAt }
}

function makeSettings(overrides: Partial<AppSettingsState> = {}): AppSettingsState {
  return reactive<AppSettingsState>({
    language: 'en' as AppLanguage,
    theme: 'auto' as AppTheme,
    syncApiBaseUrl: 'https://example.test',
    syncToken: 'tok',
    autoSyncEnabled: false,
    lastSyncedAt: null,
    lastSyncError: null,
    libraryViewMode: 'grid' as LibraryViewMode,
    backupReminderEnabled: false,
    lastBackupExportedAt: null,
    backupReminderDismissedAt: null,
    aiReviewDraftAvailable: false,
    igdbMetadataAvailable: false,
    syncApiVersion: 1,
    aiLocalReviewDraftEnabled: false,
    aiLocalReviewModel: '',
    ...overrides,
  })
}

function makeDeps(overrides: Partial<Record<string, unknown>> = {}) {
  const games = ref<Game[]>([])
  const selectedGameId = ref<string | null>(null)
  const gameForm = reactive<GameFormState>({
    id: null,
    title: '',
    platform: '',
    ownershipType: '',
    status: 'backlog',
    rating: '',
    playTimeHours: '',
    review: '',
    tags: '',
    finishedAt: '',
    pausedAt: '',
    nudgeAt: '',
    igdbId: '',
    releaseYear: '',
    developer: '',
    publisher: '',
    coverUrl: '',
    priority: '',
  })

  return {
    games,
    hasMultipleJourneys: ref(false),
    selectedGameId,
    gameForm,
    isSyncing: ref(false),
    isTestingSyncConnection: ref(false),
    autoSyncStarted: ref(false),
    capabilityRefreshStarted: ref(false),
    localChangeRevision: ref(0),
    settings: makeSettings(),
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
    loadLogs: vi.fn().mockResolvedValue(undefined),
    unlockEarnedTrophies: vi.fn().mockResolvedValue([]),
    editGame: vi.fn(),
    resetForm: vi.fn(),
    setFeedback: vi.fn(),
    setAiReviewDraftAvailable: vi.fn(),
    setIgdbMetadataAvailable: vi.fn(),
    setSyncApiVersion: vi.fn(),
    setLastSyncedAt: vi.fn(),
    setLastSyncError: vi.fn(),
    ...overrides,
  } as Parameters<typeof createSyncHandlers>[0]
}

describe('createSyncHandlers > syncNow', () => {
  beforeEach(() => {
    createSyncSnapshotMock.mockReset()
    replaceWithSyncSnapshotMock.mockReset()
    syncWithBackendMock.mockReset()
    testSyncConnectionMock.mockReset()

    replaceWithSyncSnapshotMock.mockResolvedValue(undefined)
    testSyncConnectionMock.mockResolvedValue({
      user: { id: 1, email: null, displayName: null },
      capabilities: { reviewDraft: true, igdbMetadata: true },
    })
  })

  it('blocks v1 sync when the library contains multiple Journeys', async () => {
    const deps = makeDeps({ hasMultipleJourneys: ref(true) })
    const { syncNow } = createSyncHandlers(deps)

    await expect(syncNow()).rejects.toThrow(/sync API v2 is required/i)
    expect(syncWithBackendMock).not.toHaveBeenCalled()
    expect(deps.setFeedback).toHaveBeenCalledWith(
      expect.stringMatching(/sync API v2 is required/i),
      'error',
    )
  })

  it('allows v2 sync when the library contains multiple Journeys', async () => {
    createSyncSnapshotMock.mockResolvedValue(makeSnapshot([]))
    syncWithBackendMock.mockResolvedValue(makeResponse(makeSnapshot([])))
    const deps = makeDeps({
      hasMultipleJourneys: ref(true),
      settings: makeSettings({ syncApiVersion: 2 }),
    })
    const { syncNow } = createSyncHandlers(deps)

    await expect(syncNow({ source: 'auto', silentSuccess: true })).resolves.toBeDefined()
    expect(syncWithBackendMock).toHaveBeenCalledTimes(1)
  })

  describe('snapshot diff', () => {
    it('rebuilds the local store when the server returns a different updatedAt for a game', async () => {
      // Regression for the IGDB-enrich bug: post-enrich the server bumps updatedAt,
      // so the snapshot signatures differ and the rebuild MUST run — otherwise the
      // enriched cover never reaches IndexedDB. If snapshotsMatch ever expands its
      // signature in a way that misses this, this test should fail.
      const localGame = makeGame({ updatedAt: '2026-01-01T00:00:00.000Z', coverUrl: null })
      const enrichedGame = makeGame({
        updatedAt: '2026-01-01T00:00:01.000Z',
        coverUrl: 'https://images.igdb.test/cover.jpg',
      })

      createSyncSnapshotMock.mockResolvedValue(makeSnapshot([localGame]))
      syncWithBackendMock.mockResolvedValue(makeResponse(makeSnapshot([enrichedGame])))

      const deps = makeDeps()
      const { syncNow } = createSyncHandlers(deps)

      await syncNow({ source: 'manual', silentSuccess: true })

      expect(replaceWithSyncSnapshotMock).toHaveBeenCalledTimes(1)
      const applied = replaceWithSyncSnapshotMock.mock.calls[0][0] as SyncSnapshot
      expect(applied.games[0].coverUrl).toBe('https://images.igdb.test/cover.jpg')
    })

    it('skips the rebuild when every record signature matches', async () => {
      const game = makeGame()
      createSyncSnapshotMock.mockResolvedValue(makeSnapshot([game]))
      // Server returns the same game with the same updatedAt — common no-op case.
      syncWithBackendMock.mockResolvedValue(makeResponse(makeSnapshot([game])))

      const deps = makeDeps()
      const { syncNow } = createSyncHandlers(deps)

      await syncNow({ source: 'manual', silentSuccess: true })

      expect(replaceWithSyncSnapshotMock).not.toHaveBeenCalled()
      expect(deps.setLastSyncedAt).toHaveBeenCalledWith('2026-05-28T12:00:00.000Z')
    })

    it('rebuilds when the remote has a record the local snapshot does not', async () => {
      createSyncSnapshotMock.mockResolvedValue(makeSnapshot([]))
      syncWithBackendMock.mockResolvedValue(makeResponse(makeSnapshot([makeGame()])))

      const deps = makeDeps()
      const { syncNow } = createSyncHandlers(deps)

      await syncNow({ source: 'manual', silentSuccess: true })

      expect(replaceWithSyncSnapshotMock).toHaveBeenCalledTimes(1)
    })

    it('falls back to the local trophies when the server omits earnedTrophies', async () => {
      const trophy: EarnedTrophy = {
        id: 't1',
        trophyId: 'first-game',
        earnedAt: '2026-01-01T00:00:00.000Z',
        gameId: null,
        context: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        deletedAt: null,
      }
      const game = makeGame()
      createSyncSnapshotMock.mockResolvedValue(makeSnapshot([game], [], [trophy]))
      // Response without earnedTrophies field — older server contract.
      syncWithBackendMock.mockResolvedValue({
        games: [makeGame({ updatedAt: '2026-02-01T00:00:00.000Z' })],
        logs: [],
        syncedAt: '2026-05-28T12:00:00.000Z',
      })

      const deps = makeDeps()
      const { syncNow } = createSyncHandlers(deps)

      await syncNow({ source: 'manual', silentSuccess: true })

      const applied = replaceWithSyncSnapshotMock.mock.calls[0][0] as SyncSnapshot
      expect(applied.earnedTrophies).toEqual([trophy])
    })
  })

  describe('local-change race guard', () => {
    it('skips the apply when a local change lands during the network round-trip', async () => {
      const deps = makeDeps()
      createSyncSnapshotMock.mockResolvedValue(makeSnapshot([]))

      // Simulate the user mutating local state between snapshot creation and
      // the network response.
      syncWithBackendMock.mockImplementation(async () => {
        deps.localChangeRevision.value += 1
        return makeResponse(makeSnapshot([makeGame()]))
      })

      const { syncNow } = createSyncHandlers(deps)
      await syncNow({ source: 'manual', silentSuccess: true })

      expect(replaceWithSyncSnapshotMock).not.toHaveBeenCalled()
    })

    it('still surfaces an info feedback message when the apply is skipped and silentSuccess is false', async () => {
      const deps = makeDeps()
      createSyncSnapshotMock.mockResolvedValue(makeSnapshot([]))
      syncWithBackendMock.mockImplementation(async () => {
        deps.localChangeRevision.value += 1
        return makeResponse(makeSnapshot([]))
      })

      const { syncNow } = createSyncHandlers(deps)
      await syncNow({ source: 'manual' })

      expect(deps.setFeedback).toHaveBeenCalledWith(expect.any(String), 'info')
    })
  })

  describe('capability refresh', () => {
    it('refreshes capabilities on a manual sync', async () => {
      createSyncSnapshotMock.mockResolvedValue(makeSnapshot([]))
      syncWithBackendMock.mockResolvedValue(makeResponse(makeSnapshot([])))

      const deps = makeDeps()
      const { syncNow } = createSyncHandlers(deps)
      await syncNow({ source: 'manual', silentSuccess: true })

      expect(testSyncConnectionMock).toHaveBeenCalledTimes(1)
      expect(deps.setAiReviewDraftAvailable).toHaveBeenCalledWith(true)
      expect(deps.setIgdbMetadataAvailable).toHaveBeenCalledWith(true)
      expect(deps.setSyncApiVersion).toHaveBeenCalledWith(1)
    })

    it('skips the capability refresh on an auto-sync', async () => {
      createSyncSnapshotMock.mockResolvedValue(makeSnapshot([]))
      syncWithBackendMock.mockResolvedValue(makeResponse(makeSnapshot([])))

      const deps = makeDeps()
      const { syncNow } = createSyncHandlers(deps)
      await syncNow({ source: 'auto', silentSuccess: true, errorFeedback: false })

      expect(testSyncConnectionMock).not.toHaveBeenCalled()
    })

    it('still resolves the sync when the capability refresh fails', async () => {
      // The refresh is a best-effort secondary call; a failure must not poison the sync.
      createSyncSnapshotMock.mockResolvedValue(makeSnapshot([]))
      syncWithBackendMock.mockResolvedValue(makeResponse(makeSnapshot([])))
      testSyncConnectionMock.mockRejectedValueOnce(new Error('Capabilities down'))

      const deps = makeDeps()
      const { syncNow } = createSyncHandlers(deps)
      await expect(syncNow({ source: 'manual', silentSuccess: true })).resolves.toBeDefined()
      expect(deps.setLastSyncError).toHaveBeenCalledWith(null)
    })

    it('defaults igdbMetadata to true when the server omits the field', async () => {
      // Older MioServer versions may not include `igdbMetadata` in capabilities;
      // the client treats absence as enabled.
      createSyncSnapshotMock.mockResolvedValue(makeSnapshot([]))
      syncWithBackendMock.mockResolvedValue(makeResponse(makeSnapshot([])))
      testSyncConnectionMock.mockResolvedValueOnce({
        user: { id: 1, email: null, displayName: null },
        capabilities: { reviewDraft: false },
      })

      const deps = makeDeps()
      const { syncNow } = createSyncHandlers(deps)
      await syncNow({ source: 'manual', silentSuccess: true })

      expect(deps.setIgdbMetadataAvailable).toHaveBeenCalledWith(true)
    })

    it('stores the sync API version reported by the server', async () => {
      const deps = makeDeps({ hasMultipleJourneys: ref(true) })
      testSyncConnectionMock.mockResolvedValueOnce({
        version: 2,
        user: { id: 1, email: null, displayName: null },
        capabilities: { reviewDraft: true, igdbMetadata: true },
      })
      const { refreshSyncCapabilities } = createSyncHandlers(deps)

      await refreshSyncCapabilities()

      expect(deps.setSyncApiVersion).toHaveBeenCalledWith(2)
    })
  })

  describe('config & error handling', () => {
    it('rejects sync when the base URL is empty', async () => {
      const deps = makeDeps({ settings: makeSettings({ syncApiBaseUrl: '   ' }) })
      const { syncNow } = createSyncHandlers(deps)

      await expect(syncNow({ source: 'manual' })).rejects.toThrow()
      expect(syncWithBackendMock).not.toHaveBeenCalled()
    })

    it('rejects sync when the token is empty', async () => {
      const deps = makeDeps({ settings: makeSettings({ syncToken: '   ' }) })
      const { syncNow } = createSyncHandlers(deps)

      await expect(syncNow({ source: 'manual' })).rejects.toThrow()
      expect(syncWithBackendMock).not.toHaveBeenCalled()
    })

    it('records the last sync error and rethrows when the backend fails', async () => {
      createSyncSnapshotMock.mockResolvedValue(makeSnapshot([]))
      syncWithBackendMock.mockRejectedValue(new Error('Server down'))

      const deps = makeDeps()
      const { syncNow } = createSyncHandlers(deps)

      await expect(syncNow({ source: 'manual' })).rejects.toThrow(/server down/i)
      expect(deps.setLastSyncError).toHaveBeenCalledWith(expect.stringMatching(/server down/i))
      expect(deps.setFeedback).toHaveBeenCalledWith(expect.any(String), 'error')
    })

    it('skips the error feedback when errorFeedback is false', async () => {
      createSyncSnapshotMock.mockResolvedValue(makeSnapshot([]))
      syncWithBackendMock.mockRejectedValue(new Error('Server down'))

      const deps = makeDeps()
      const { syncNow } = createSyncHandlers(deps)

      await expect(syncNow({ source: 'auto', errorFeedback: false })).rejects.toThrow()
      expect(deps.setFeedback).not.toHaveBeenCalledWith(expect.any(String), 'error')
    })

    it('always clears isSyncing in the finally block', async () => {
      createSyncSnapshotMock.mockResolvedValue(makeSnapshot([]))
      syncWithBackendMock.mockRejectedValue(new Error('Server down'))

      const deps = makeDeps()
      const { syncNow } = createSyncHandlers(deps)

      await expect(syncNow({ source: 'manual' })).rejects.toThrow()
      expect(deps.isSyncing.value).toBe(false)
    })
  })

  describe('post-sync side effects', () => {
    it('refreshes the selected game in the form after a rebuild', async () => {
      const stale = makeGame({ id: 'g1', title: 'Old title' })
      const fresh = makeGame({ id: 'g1', title: 'New title', updatedAt: '2026-02-01T00:00:00.000Z' })

      createSyncSnapshotMock.mockResolvedValue(makeSnapshot([stale]))
      syncWithBackendMock.mockResolvedValue(makeResponse(makeSnapshot([fresh])))

      const deps = makeDeps()
      deps.gameForm.id = 'g1'
      ;(deps.ensureLoaded as Mock).mockImplementation(async () => {
        // Simulate the in-memory game list being repopulated from the rebuilt DB.
        deps.games.value = [fresh]
      })

      const { syncNow } = createSyncHandlers(deps)
      await syncNow({ source: 'manual', silentSuccess: true })

      expect(deps.editGame).toHaveBeenCalledWith(fresh)
    })

    it('resets the form when the selected game disappears after a rebuild', async () => {
      const stale = makeGame({ id: 'g1' })
      createSyncSnapshotMock.mockResolvedValue(makeSnapshot([stale]))
      syncWithBackendMock.mockResolvedValue(makeResponse(makeSnapshot([])))

      const deps = makeDeps()
      deps.gameForm.id = 'g1'

      const { syncNow } = createSyncHandlers(deps)
      await syncNow({ source: 'manual', silentSuccess: true })

      expect(deps.resetForm).toHaveBeenCalled()
    })
  })
})
