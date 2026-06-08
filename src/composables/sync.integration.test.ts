import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { reactive, ref } from 'vue'
import type {
  AppLanguage,
  AppTheme,
  Game,
  GameFormState,
  LibraryViewMode,
  SyncResponse,
} from '../types'
import type { AppSettingsState } from './useSettings'

// Integration test: runs the sync composable against REAL Dexie (via fake-indexeddb
// — see vitest.setup.ts). Only the network boundary is mocked; the IndexedDB
// snapshot+rebuild path is exercised end-to-end. The point is to catch bugs
// the unit-level sync.test.ts can't see — e.g. the IGDB-enrichment regression
// where the in-memory store update was correct but the IndexedDB rebuild was
// silently skipped.

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

import { syncWithBackend, testSyncConnection } from '../lib/syncApi'
import {
  getAllGames,
  replaceWithSyncSnapshot,
  saveGame,
} from '../lib/backlogDb'
import { createSyncHandlers } from './sync'

const syncWithBackendMock = syncWithBackend as unknown as Mock
const testSyncConnectionMock = testSyncConnection as unknown as Mock

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    title: 'Example',
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

function makeResponse(games: Game[], syncedAt = '2026-05-28T12:00:00.000Z'): SyncResponse {
  return { games, logs: [], earnedTrophies: [], syncedAt }
}

function makeSettings(): AppSettingsState {
  return reactive<AppSettingsState>({
    language: 'en' as AppLanguage,
    theme: 'auto' as AppTheme,
    syncApiBaseUrl: 'https://example.test',
    syncToken: 'tok',
    autoSyncEnabled: false,
    lastSyncedAt: null,
    lastSyncError: null,
    libraryViewMode: 'list' as LibraryViewMode,
    backupReminderEnabled: false,
    lastBackupExportedAt: null,
    backupReminderDismissedAt: null,
    aiReviewDraftAvailable: false,
    igdbMetadataAvailable: false,
    aiLocalReviewDraftEnabled: false,
    aiLocalReviewModel: '',
  })
}

function makeDeps() {
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
    setLastSyncedAt: vi.fn(),
    setLastSyncError: vi.fn(),
  } as Parameters<typeof createSyncHandlers>[0]
}

describe('sync integration (real Dexie via fake-indexeddb)', () => {
  beforeEach(async () => {
    syncWithBackendMock.mockReset()
    testSyncConnectionMock.mockReset()
    testSyncConnectionMock.mockResolvedValue({
      user: { id: 1, email: null, displayName: null },
      capabilities: { reviewDraft: true, igdbMetadata: true },
    })

    // Reset the real Dexie database between tests.
    await replaceWithSyncSnapshot({ games: [], logs: [], earnedTrophies: [] })
  })

  it('writes the enriched cover into IndexedDB when the server response bumps updatedAt', async () => {
    // This is the canonical regression test for the IGDB-enrich bug
    // (mio-server: IgdbMetadataEnricher used to write fields without bumping
    // Game.updatedAt; the PWA's snapshot diff then skipped the rebuild and the
    // cover never reached IndexedDB). After the server-side fix, the post-enrich
    // server response carries a new updatedAt — and the client must persist the
    // enriched cover into Dexie.
    await saveGame(
      makeGame({
        id: 'celeste',
        title: 'Celeste',
        igdbId: 1454,
        coverUrl: null,
        updatedAt: '2026-05-01T10:00:00.000Z',
      }),
    )

    syncWithBackendMock.mockResolvedValue(
      makeResponse([
        makeGame({
          id: 'celeste',
          title: 'Celeste',
          igdbId: 1454,
          coverUrl: 'https://images.igdb.test/celeste.jpg',
          updatedAt: '2026-05-28T11:59:00.000Z',
        }),
      ]),
    )

    const { syncNow } = createSyncHandlers(makeDeps())
    await syncNow({ source: 'manual', silentSuccess: true })

    const stored = await getAllGames()
    expect(stored).toHaveLength(1)
    expect(stored[0].coverUrl).toBe('https://images.igdb.test/celeste.jpg')
  })

  it('preserves locally-set developer/publisher/releaseYear when the server returns null for them', async () => {
    // replaceWithSyncSnapshot has a documented carve-out: developer/publisher/
    // releaseYear/priority that were set locally must NOT be wiped by a server
    // response that left those fields blank. (Other fields follow the server.)
    await saveGame(
      makeGame({
        id: 'tunic',
        title: 'Tunic',
        developer: 'Andrew Shouldice',
        publisher: 'Finji',
        releaseYear: 2022,
        priority: 'high-interest',
        updatedAt: '2026-05-01T10:00:00.000Z',
      }),
    )

    syncWithBackendMock.mockResolvedValue(
      makeResponse([
        makeGame({
          id: 'tunic',
          title: 'Tunic',
          // Server explicitly returns these as null/undefined — e.g. a fresh
          // device that hasn't synced the local edits yet.
          developer: null,
          publisher: null,
          releaseYear: null,
          priority: null,
          coverUrl: 'https://images.igdb.test/tunic.jpg',
          updatedAt: '2026-05-28T11:59:00.000Z',
        }),
      ]),
    )

    const { syncNow } = createSyncHandlers(makeDeps())
    await syncNow({ source: 'manual', silentSuccess: true })

    const stored = await getAllGames()
    expect(stored[0].developer).toBe('Andrew Shouldice')
    expect(stored[0].publisher).toBe('Finji')
    expect(stored[0].releaseYear).toBe(2022)
    expect(stored[0].priority).toBe('high-interest')
    expect(stored[0].coverUrl).toBe('https://images.igdb.test/tunic.jpg')
  })

  it('persists server-side deletions (tombstoned games) into IndexedDB', async () => {
    await saveGame(
      makeGame({
        id: 'to-delete',
        title: 'Soon Gone',
        updatedAt: '2026-05-01T10:00:00.000Z',
      }),
    )

    syncWithBackendMock.mockResolvedValue(
      makeResponse([
        makeGame({
          id: 'to-delete',
          title: 'Soon Gone',
          updatedAt: '2026-05-28T11:59:00.000Z',
          deletedAt: '2026-05-28T11:59:00.000Z',
        }),
      ]),
    )

    const { syncNow } = createSyncHandlers(makeDeps())
    await syncNow({ source: 'manual', silentSuccess: true })

    // getAllGames() filters tombstones by default — but the row should still
    // exist in the underlying table (this is what lets the next sync upload it
    // as a tombstone). Both checks together prove the deletion was actually
    // applied to IndexedDB.
    const visible = await getAllGames(false)
    const all = await getAllGames(true)
    expect(visible).toHaveLength(0)
    expect(all).toHaveLength(1)
    expect(all[0].deletedAt).toBe('2026-05-28T11:59:00.000Z')
  })

  it('leaves IndexedDB untouched when the server signature matches local (no churn)', async () => {
    // The snapshotsMatch optimization is an end-to-end no-op when both sides
    // already agree — we should not even pay the cost of clearing+repopulating.
    // To prove the local DB was untouched, the locally-stored row has a sentinel
    // field (`developer`) that the server response omits; if the rebuild ran,
    // the carve-out would still preserve it but the row's reference would change.
    // Easier: assert the cover URL remains identical (server response would have
    // overwritten it with null if the rebuild had fired).
    await saveGame(
      makeGame({
        id: 'unchanged',
        title: 'Already Synced',
        coverUrl: 'https://images.igdb.test/preserved.jpg',
        updatedAt: '2026-05-01T10:00:00.000Z',
      }),
    )

    syncWithBackendMock.mockResolvedValue(
      makeResponse([
        makeGame({
          id: 'unchanged',
          title: 'Already Synced',
          coverUrl: null, // ← would clobber if rebuild ran (no field-level merge here)
          updatedAt: '2026-05-01T10:00:00.000Z', // same as local
        }),
      ]),
    )

    const { syncNow } = createSyncHandlers(makeDeps())
    await syncNow({ source: 'manual', silentSuccess: true })

    const stored = await getAllGames()
    // Carve-out preserves developer/publisher/releaseYear/priority on rebuild,
    // but NOT coverUrl. So if the optimization mis-fires and the rebuild runs,
    // we'd see coverUrl: null. The preserved cover proves the fast path worked.
    expect(stored[0].coverUrl).toBe('https://images.igdb.test/preserved.jpg')
  })
})
