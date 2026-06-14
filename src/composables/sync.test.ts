import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { reactive, ref } from 'vue'
import type {
  AppLanguage,
  AppTheme,
  Game,
  GameFormState,
  LibraryViewMode,
  SyncRequest,
  SyncResponse,
} from '../types'
import type { AppSettingsState } from './useSettings'

vi.mock('../lib/backlogDb', () => ({
  applySyncResponse: vi.fn(),
  createSyncRequest: vi.fn(),
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

import { applySyncResponse, createSyncRequest } from '../lib/backlogDb'
import { syncWithBackend, testSyncConnection } from '../lib/syncApi'
import { createSyncHandlers } from './sync'

const applySyncResponseMock = applySyncResponse as unknown as Mock
const createSyncRequestMock = createSyncRequest as unknown as Mock
const syncWithBackendMock = syncWithBackend as unknown as Mock
const testSyncConnectionMock = testSyncConnection as unknown as Mock

const emptyChanges = () => ({
  games: [],
  journeys: [],
  logs: [],
  earnedTrophies: [],
})

function makeRequest(): SyncRequest {
  return {
    cursor: null,
    full: true,
    changes: emptyChanges(),
  }
}

function makeResponse(overrides: Partial<SyncResponse> = {}): SyncResponse {
  return {
    cursor: 1,
    acknowledged: {
      games: [],
      journeys: [],
      logs: [],
      earnedTrophies: [],
    },
    changes: emptyChanges(),
    totals: {
      games: 0,
      journeys: 0,
      logs: 0,
    },
    syncedAt: '2026-05-28T12:00:00.000Z',
    ...overrides,
  }
}

function makeSettings(overrides: Partial<AppSettingsState> = {}): AppSettingsState {
  return reactive<AppSettingsState>({
    language: 'en' as AppLanguage,
    theme: 'auto' as AppTheme,
    syncApiBaseUrl: 'https://example.test/',
    syncToken: 'tok',
    autoSyncEnabled: false,
    lastSyncedAt: null,
    lastSyncError: null,
    libraryViewMode: 'grid' as LibraryViewMode,
    backupReminderEnabled: false,
    lastBackupExportedAt: null,
    backupReminderDismissedAt: null,
    aiReviewDraftAvailable: false,
    syncApiVersion: 1,
    aiLocalReviewDraftEnabled: false,
    aiLocalReviewModel: '',
    ...overrides,
  })
}

function makeDeps(overrides: Partial<Record<string, unknown>> = {}) {
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
    ...overrides,
  } as Parameters<typeof createSyncHandlers>[0]
}

describe('createSyncHandlers', () => {
  beforeEach(() => {
    applySyncResponseMock.mockReset().mockResolvedValue(undefined)
    createSyncRequestMock.mockReset().mockResolvedValue({
      request: makeRequest(),
      submitted: [],
    })
    syncWithBackendMock.mockReset().mockResolvedValue(makeResponse())
    testSyncConnectionMock.mockReset().mockResolvedValue({
      version: 2,
      user: { id: 7, email: null, displayName: 'Mio' },
      capabilities: { reviewDraft: true },
    })
  })

  it('blocks the legacy sync protocol for every library', async () => {
    testSyncConnectionMock.mockResolvedValueOnce({
      user: { id: 7, email: null, displayName: 'Mio' },
      capabilities: { reviewDraft: true },
    })
    const deps = makeDeps()
    const { syncNow } = createSyncHandlers(deps)

    await expect(syncNow()).rejects.toThrow(/sync API v2 is required/i)
    expect(createSyncRequestMock).not.toHaveBeenCalled()
    expect(syncWithBackendMock).not.toHaveBeenCalled()
  })

  it('sends the prepared canonical request and applies the response for the authenticated server identity', async () => {
    const request = makeRequest()
    const submitted = [{ key: 'game:g1', entity: 'game', id: 'g1', queuedUpdatedAt: 'now' }]
    const response = makeResponse()
    createSyncRequestMock.mockResolvedValueOnce({ request, submitted })
    syncWithBackendMock.mockResolvedValueOnce(response)
    const { syncNow } = createSyncHandlers(makeDeps())

    await syncNow({ source: 'manual', silentSuccess: true })

    expect(createSyncRequestMock).toHaveBeenCalledWith('https://example.test|user:7')
    expect(syncWithBackendMock).toHaveBeenCalledWith('https://example.test/', 'tok', request)
    expect(applySyncResponseMock).toHaveBeenCalledWith(
      'https://example.test|user:7',
      submitted,
      response,
    )
  })

  it('reloads local state only when the server returns changes', async () => {
    syncWithBackendMock.mockResolvedValueOnce(
      makeResponse({
        changes: {
          ...emptyChanges(),
          games: [{ id: 'g1' }] as never[],
        },
      }),
    )
    const deps = makeDeps()
    const { syncNow } = createSyncHandlers(deps)

    await syncNow({ silentSuccess: true })

    expect(deps.ensureLoaded).toHaveBeenCalledWith(true)
    expect(deps.unlockEarnedTrophies).toHaveBeenCalledWith('sync')
  })

  it('skips the reload when the server returns no changes', async () => {
    const deps = makeDeps()
    const { syncNow } = createSyncHandlers(deps)

    await syncNow({ silentSuccess: true })

    expect(deps.ensureLoaded).toHaveBeenCalledTimes(1)
    expect(deps.unlockEarnedTrophies).not.toHaveBeenCalled()
  })

  it('records capabilities, version, cursor completion time, and success feedback', async () => {
    const deps = makeDeps()
    const { syncNow } = createSyncHandlers(deps)

    await syncNow()

    expect(deps.setAiReviewDraftAvailable).toHaveBeenCalledWith(true)
    expect(deps.setSyncApiVersion).toHaveBeenCalledWith(2)
    expect(deps.setLastSyncedAt).toHaveBeenCalledWith('2026-05-28T12:00:00.000Z')
    expect(deps.setLastSyncError).toHaveBeenCalledWith(null)
    expect(deps.setFeedback).toHaveBeenCalledWith(expect.any(String))
  })

  it('records backend errors and always clears the syncing state', async () => {
    syncWithBackendMock.mockRejectedValueOnce(new Error('Server down'))
    const deps = makeDeps()
    const { syncNow } = createSyncHandlers(deps)

    await expect(syncNow()).rejects.toThrow(/server down/i)

    expect(deps.setLastSyncError).toHaveBeenCalledWith(expect.stringMatching(/server down/i))
    expect(deps.isSyncing.value).toBe(false)
  })

  it('tests and stores connection capabilities without syncing', async () => {
    const deps = makeDeps()
    const { testSyncConnection: testConnection } = createSyncHandlers(deps)

    await testConnection()

    expect(deps.setAiReviewDraftAvailable).toHaveBeenCalledWith(true)
    expect(deps.setSyncApiVersion).toHaveBeenCalledWith(2)
    expect(syncWithBackendMock).not.toHaveBeenCalled()
  })

  it('refreshes capabilities in the background', async () => {
    const deps = makeDeps()
    const { refreshSyncCapabilities } = createSyncHandlers(deps)

    await refreshSyncCapabilities()

    expect(deps.setAiReviewDraftAvailable).toHaveBeenCalledWith(true)
    expect(deps.setSyncApiVersion).toHaveBeenCalledWith(2)
  })
})
