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
    protocolVersion: 3,
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
    playLogShareTemplate: '{title}\n\n{log}\n\n{hashtags}',
    playLogShareHashtags: '#games',
    recommendationHistory: {},
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
      version: 3,
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

    await expect(syncNow()).rejects.toThrow(/sync API v3 is required/i)
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
    expect(deps.setSyncApiVersion).toHaveBeenCalledWith(3)
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

  it('requires both sync URL and token before testing or syncing', async () => {
    const missingUrl = makeDeps({ settings: makeSettings({ syncApiBaseUrl: ' ', syncToken: 'tok' }) })
    const missingToken = makeDeps({ settings: makeSettings({ syncApiBaseUrl: 'https://example.test', syncToken: ' ' }) })

    await expect(createSyncHandlers(missingUrl).syncNow()).rejects.toThrow(/backend url/i)
    await expect(createSyncHandlers(missingToken).testSyncConnection()).rejects.toThrow(/sync token/i)

    expect(testSyncConnectionMock).not.toHaveBeenCalled()
    expect(syncWithBackendMock).not.toHaveBeenCalled()
  })

  it('can suppress error feedback for automatic sync failures', async () => {
    syncWithBackendMock.mockRejectedValueOnce(new Error('Server down'))
    const deps = makeDeps()
    const { syncNow } = createSyncHandlers(deps)

    await expect(syncNow({ errorFeedback: false })).rejects.toThrow(/server down/i)

    expect(deps.setLastSyncError).toHaveBeenCalledWith(expect.stringMatching(/server down/i))
    expect(deps.setFeedback).not.toHaveBeenCalledWith(expect.stringMatching(/server down/i), 'error')
  })

  it('refreshes selected-game state after incoming changes', async () => {
    const refreshedGame = {
      id: 'selected',
      title: 'Refreshed',
      status: 'playing',
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
      updatedAt: '2026-01-02T00:00:00.000Z',
      deletedAt: null,
    } as Game
    syncWithBackendMock.mockResolvedValueOnce(
      makeResponse({
        changes: emptyChanges(),
        deletions: {
          games: [{ id: 'old', updatedAt: '2026-01-01T00:00:00.000Z' }],
          journeys: [],
          logs: [],
          earnedTrophies: [],
        },
      }),
    )
    const deps = makeDeps()
    deps.games.value = [refreshedGame]
    deps.selectedGameId.value = 'selected'
    deps.gameForm.id = 'selected'
    const { syncNow } = createSyncHandlers(deps)

    await syncNow({ silentSuccess: true })

    expect(deps.loadLogs).toHaveBeenCalledWith('selected')
    expect(deps.editGame).toHaveBeenCalledWith(refreshedGame)
    expect(deps.resetForm).not.toHaveBeenCalled()
  })

  it('resets the form when the edited game disappears during sync recovery', async () => {
    syncWithBackendMock.mockResolvedValueOnce(makeResponse({ recoveryRequired: true }))
    const deps = makeDeps()
    deps.gameForm.id = 'missing'
    const { syncNow } = createSyncHandlers(deps)

    await syncNow({ silentSuccess: true })

    expect(deps.ensureLoaded).toHaveBeenCalledWith(true)
    expect(deps.resetForm).toHaveBeenCalledOnce()
  })

  it('tests and stores connection capabilities without syncing', async () => {
    const deps = makeDeps()
    const { testSyncConnection: testConnection } = createSyncHandlers(deps)

    await testConnection()

    expect(deps.setAiReviewDraftAvailable).toHaveBeenCalledWith(true)
    expect(deps.setSyncApiVersion).toHaveBeenCalledWith(3)
    expect(syncWithBackendMock).not.toHaveBeenCalled()
  })

  it('records connection test failures', async () => {
    testSyncConnectionMock.mockRejectedValueOnce(new Error('Nope'))
    const deps = makeDeps()
    const { testSyncConnection: testConnection } = createSyncHandlers(deps)

    await expect(testConnection()).rejects.toThrow(/nope/i)

    expect(deps.setLastSyncError).toHaveBeenCalledWith(expect.stringMatching(/nope/i))
    expect(deps.setFeedback).toHaveBeenCalledWith(expect.stringMatching(/nope/i), 'error')
    expect(deps.isTestingSyncConnection.value).toBe(false)
  })

  it('refreshes capabilities in the background', async () => {
    const deps = makeDeps()
    const { refreshSyncCapabilities } = createSyncHandlers(deps)

    await refreshSyncCapabilities()

    expect(deps.setAiReviewDraftAvailable).toHaveBeenCalledWith(true)
    expect(deps.setSyncApiVersion).toHaveBeenCalledWith(3)
  })

  it('skips duplicate or unconfigured capability refreshes', async () => {
    const alreadyStarted = makeDeps({ capabilityRefreshStarted: ref(true) })
    const unconfigured = makeDeps({ settings: makeSettings({ syncToken: '' }) })

    await createSyncHandlers(alreadyStarted).refreshSyncCapabilities()
    await createSyncHandlers(unconfigured).refreshSyncCapabilities()

    expect(testSyncConnectionMock).not.toHaveBeenCalled()
  })

  it('keeps previous capabilities when background refresh fails', async () => {
    testSyncConnectionMock.mockRejectedValueOnce(new Error('offline'))
    const deps = makeDeps()

    await createSyncHandlers(deps).refreshSyncCapabilities()

    expect(deps.capabilityRefreshStarted.value).toBe(true)
    expect(deps.setSyncApiVersion).not.toHaveBeenCalled()
  })

  it('schedules automatic sync only when the v3 connection is configured', async () => {
    vi.useFakeTimers()
    const deps = makeDeps({ settings: makeSettings({ autoSyncEnabled: true, syncApiVersion: 3 }) })
    const { scheduleAutoSync } = createSyncHandlers(deps)

    scheduleAutoSync(10)
    await vi.advanceTimersByTimeAsync(10)

    expect(syncWithBackendMock).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('starts focus and online auto-sync listeners only once', async () => {
    const deps = makeDeps({ settings: makeSettings({ autoSyncEnabled: true, syncApiVersion: 3 }) })
    const { startAutoSync } = createSyncHandlers(deps)

    startAutoSync()
    startAutoSync()
    await vi.waitFor(() => {
      expect(syncWithBackendMock).toHaveBeenCalledTimes(1)
    })

    window.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => {
      expect(syncWithBackendMock).toHaveBeenCalledTimes(2)
    })

    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => {
      expect(syncWithBackendMock).toHaveBeenCalledTimes(3)
    })

    expect(deps.autoSyncStarted.value).toBe(true)
  })
})
