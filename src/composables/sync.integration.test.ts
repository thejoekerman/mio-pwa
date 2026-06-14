import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { reactive, ref } from 'vue'
import type {
  AppLanguage,
  AppTheme,
  CanonicalGame,
  Game,
  GameFormState,
  Journey,
  LibraryViewMode,
  SyncRequest,
  SyncResponse,
} from '../types'
import type { AppSettingsState } from './useSettings'

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
  getAllCanonicalGames,
  getAllJourneys,
  importBackupData,
  saveGame,
  saveJourney,
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
    finishedAt: null,
    pausedAt: null,
    nudgeAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

function responseFor(request: SyncRequest, overrides: Partial<SyncResponse> = {}): SyncResponse {
  return {
    cursor: 1,
    acknowledged: {
      games: request.changes.games.map(({ id }) => id),
      journeys: request.changes.journeys.map(({ id }) => id),
      logs: request.changes.logs.map(({ id }) => id),
      earnedTrophies: request.changes.earnedTrophies.map(({ id }) => id),
    },
    changes: request.changes,
    totals: {
      games: request.changes.games.filter(({ deletedAt }) => deletedAt === null).length,
      journeys: request.changes.journeys.filter(({ deletedAt }) => deletedAt === null).length,
      logs: request.changes.logs.filter(({ deletedAt }) => deletedAt === null).length,
    },
    syncedAt: '2026-05-28T12:00:00.000Z',
    ...overrides,
  }
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
    syncApiVersion: 2,
    aiLocalReviewDraftEnabled: false,
    aiLocalReviewModel: '',
    playLogShareTemplate: '{title}\n\n{log}\n\n{hashtags}',
    playLogShareHashtags: '#games',
  })
}

function makeDeps() {
  const games = ref<Game[]>([])
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
    wikidataId: '',
    wikipediaTitle: '',
    coverSourceUrl: '',
    coverSourcePageUrl: '',
    metadataReviewed: false,
    releaseYear: '',
    developer: '',
    publisher: '',
    coverUrl: '',
    priority: '',
  })

  return {
    games,
    selectedGameId: ref<string | null>(null),
    gameForm,
    isSyncing: ref(false),
    isTestingSyncConnection: ref(false),
    autoSyncStarted: ref(false),
    capabilityRefreshStarted: ref(false),
    settings: makeSettings(),
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
    loadLogs: vi.fn().mockResolvedValue(undefined),
    unlockEarnedTrophies: vi.fn().mockResolvedValue([]),
    editGame: vi.fn(),
    resetForm: vi.fn(),
    setFeedback: vi.fn(),
    setAiReviewDraftAvailable: vi.fn(),
    setSyncApiVersion: vi.fn(),
    setLastSyncedAt: vi.fn(),
    setLastSyncError: vi.fn(),
  } as Parameters<typeof createSyncHandlers>[0]
}

describe('incremental sync integration (real Dexie via fake-indexeddb)', () => {
  beforeEach(async () => {
    syncWithBackendMock.mockReset()
    testSyncConnectionMock.mockReset().mockResolvedValue({
      version: 2,
      user: { id: 1, email: null, displayName: 'Mio' },
      capabilities: { reviewDraft: true },
    })
    await importBackupData({ games: [], journeys: [], logs: [], earnedTrophies: [] }, 'replace')
  })

  it('sends a canonical full reconciliation on the first sync', async () => {
    await saveGame(makeGame())
    syncWithBackendMock.mockImplementation(async (_url, _token, request: SyncRequest) =>
      responseFor(request),
    )

    await createSyncHandlers(makeDeps()).syncNow({ silentSuccess: true })

    const request = syncWithBackendMock.mock.calls[0][2] as SyncRequest
    expect(request.cursor).toBeNull()
    expect(request.full).toBe(true)
    expect(request.changes.games).toHaveLength(1)
    expect(request.changes.journeys).toHaveLength(1)
    expect(request.changes.games[0]).not.toHaveProperty('status')
    expect(request.changes.journeys[0]).toHaveProperty('status', 'backlog')
  })

  it('sends only a changed Journey after the first sync', async () => {
    await saveGame(makeGame())
    syncWithBackendMock.mockImplementation(async (_url, _token, request: SyncRequest) =>
      responseFor(request, { cursor: syncWithBackendMock.mock.calls.length }),
    )
    const handlers = createSyncHandlers(makeDeps())
    await handlers.syncNow({ silentSuccess: true })

    const [journey] = await getAllJourneys()
    await saveJourney({ ...journey, status: 'playing', updatedAt: '2026-02-01T00:00:00.000Z' })
    await handlers.syncNow({ silentSuccess: true })

    const request = syncWithBackendMock.mock.calls[1][2] as SyncRequest
    expect(request.cursor).toBe(1)
    expect(request.full).toBe(false)
    expect(request.changes.games).toEqual([])
    expect(request.changes.journeys).toHaveLength(1)
    expect(request.changes.journeys[0].status).toBe('playing')
  })

  it('applies canonical remote changes without flattening them', async () => {
    const remoteGame: CanonicalGame = {
      id: 'remote',
      title: 'Remote Game',
      releaseYear: 2026,
      developers: ['Studio'],
      publishers: [],
      genres: [],
      themes: [],
      gameModes: [],
      tags: [],
      cover: null,
      externalReferences: [],
      playtimeEstimates: null,
      metadataReviewedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
    }
    const remoteJourney: Journey = {
      id: 'remote-journey',
      gameId: 'remote',
      status: 'playing',
      platform: 'PC',
      ownershipType: null,
      priority: null,
      rating: null,
      review: '',
      playTimeHours: null,
      startedAt: null,
      finishedAt: null,
      pausedAt: null,
      nudgeAt: null,
      createdAt: remoteGame.createdAt,
      updatedAt: remoteGame.updatedAt,
      deletedAt: null,
    }
    syncWithBackendMock.mockImplementation(async (_url, _token, request: SyncRequest) =>
      responseFor(request, {
        changes: {
          games: [remoteGame],
          journeys: [remoteJourney],
          logs: [],
          earnedTrophies: [],
        },
      }),
    )

    await createSyncHandlers(makeDeps()).syncNow({ silentSuccess: true })

    expect(await getAllCanonicalGames()).toContainEqual(remoteGame)
    expect(await getAllJourneys()).toContainEqual(remoteJourney)
  })
})
