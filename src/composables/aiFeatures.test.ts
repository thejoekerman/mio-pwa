import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { computed, reactive, ref } from 'vue'
import type {
  AppLanguage,
  AppTheme,
  Game,
  LogEntry,
  LibraryViewMode,
} from '../types'
import type { AppSettingsState } from './useSettings'

// Mock the network and the heavy WebLLM-backed local-draft module so the
// composable's orchestration is testable in isolation. No MioServer or model
// download involved.
vi.mock('../lib/syncApi', () => ({
  requestReviewDraft: vi.fn(),
}))

vi.mock('../lib/localReviewDraft', () => ({
  generateLocalReviewDraft: vi.fn(),
}))

import { requestReviewDraft } from '../lib/syncApi'
import { generateLocalReviewDraft } from '../lib/localReviewDraft'
import { createAiHandlers } from './aiFeatures'

const requestReviewDraftMock = requestReviewDraft as unknown as Mock
const generateLocalReviewDraftMock = generateLocalReviewDraft as unknown as Mock

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    title: 'Outer Wilds',
    status: 'finished',
    rating: null,
    playTimeHours: null,
    review: '',
    platform: '',
    ownershipType: null,
    tags: [],
    finishedAt: '2026-04-15',
    pausedAt: null,
    nudgeAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-04-15T00:00:00.000Z',
    deletedAt: null,
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
    aiReviewDraftAvailable: true,
    syncApiVersion: 1,
    aiLocalReviewDraftEnabled: false,
    aiLocalReviewModel: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  })
}

function makeDeps(overrides: {
  game?: Game | null
  serverReady?: boolean
  settings?: AppSettingsState
} = {}) {
  const { game = makeGame(), serverReady = true, settings = makeSettings() } = overrides

  const selectedGame = computed(() => game)
  const serverReviewDraftReady = computed(() => serverReady)
  return {
    deps: {
      selectedGame,
      logs: ref<LogEntry[]>([]),
      settings,
      serverReviewDraftReady,
      isDraftingReview: ref(false),
      reviewDraftPreview: ref(''),
      localReviewProgress: ref(''),
      setFeedback: vi.fn(),
      ensureSyncConfig: vi.fn(),
      applyReview: vi.fn().mockResolvedValue(undefined),
      scheduleAutoSync: vi.fn(),
    } as Parameters<typeof createAiHandlers>[0],
  }
}

describe('createAiHandlers', () => {
  beforeEach(() => {
    requestReviewDraftMock.mockReset()
    generateLocalReviewDraftMock.mockReset()
    window.localStorage.clear()
  })

  describe('generateReviewDraft — server path', () => {
    it('calls the MioServer endpoint and stores the trimmed draft in preview', async () => {
      requestReviewDraftMock.mockResolvedValue({ gameId: 'g1', draft: '  Hello from the server.  ' })
      const { deps } = makeDeps()
      const { generateReviewDraft } = createAiHandlers(deps)

      const result = await generateReviewDraft()

      expect(requestReviewDraftMock).toHaveBeenCalledWith(
        'https://example.test',
        'tok',
        'g1',
        'en',
      )
      expect(deps.ensureSyncConfig).toHaveBeenCalled()
      expect(deps.reviewDraftPreview.value).toBe('Hello from the server.')
      expect(deps.isDraftingReview.value).toBe(false)
      expect(result).toEqual({ gameId: 'g1', draft: '  Hello from the server.  ' })
    })

    it('surfaces server errors as feedback and rethrows', async () => {
      requestReviewDraftMock.mockRejectedValue(new Error('Server down'))
      const { deps } = makeDeps()
      const { generateReviewDraft } = createAiHandlers(deps)

      await expect(generateReviewDraft()).rejects.toThrow(/server down/i)
      expect(deps.setFeedback).toHaveBeenCalledWith(expect.stringMatching(/server down/i), 'error')
      // Always clears the in-flight flag.
      expect(deps.isDraftingReview.value).toBe(false)
    })

    it('is a no-op when nothing is selected', async () => {
      const { deps } = makeDeps({ game: null })
      const { generateReviewDraft } = createAiHandlers(deps)

      await generateReviewDraft()
      expect(requestReviewDraftMock).not.toHaveBeenCalled()
    })
  })

  describe('generateReviewDraft — local fallback (selection)', () => {
    it('chooses the local path when the server path is not ready', async () => {
      generateLocalReviewDraftMock.mockResolvedValue('Local draft text.')
      const settings = makeSettings()
      const { deps } = makeDeps({ serverReady: false, settings })
      const { generateReviewDraft } = createAiHandlers(deps)

      await generateReviewDraft()

      expect(requestReviewDraftMock).not.toHaveBeenCalled()
      expect(generateLocalReviewDraftMock).toHaveBeenCalledTimes(1)
      expect(deps.reviewDraftPreview.value).toBe('Local draft text.')
      // Crash-sentinel is cleared on a clean finish.
      expect(window.localStorage.getItem('miolog-local-draft-pending')).toBeNull()
    })

    it('refuses to start when the crash sentinel from a previous run is still set', async () => {
      // Simulate a previous on-device run that crashed the tab (iOS OOM) before
      // it could clear its marker.
      window.localStorage.setItem(
        'miolog-local-draft-pending',
        JSON.stringify({ modelId: 'gemma-2-2b-it-q4f16_1-MLC', at: Date.now() }),
      )

      const { deps } = makeDeps({ serverReady: false })
      const { generateReviewDraft } = createAiHandlers(deps)

      await expect(generateReviewDraft()).rejects.toThrow()
      expect(generateLocalReviewDraftMock).not.toHaveBeenCalled()
      expect(deps.setFeedback).toHaveBeenCalledWith(expect.any(String), 'error')
      // Sentinel is cleared so the next attempt can proceed.
      expect(window.localStorage.getItem('miolog-local-draft-pending')).toBeNull()
    })

    it('classifies WebGPU errors and uses the unsupported message', async () => {
      generateLocalReviewDraftMock.mockRejectedValue(new Error('no available adapter'))
      const { deps } = makeDeps({ serverReady: false })
      const { generateReviewDraft } = createAiHandlers(deps)

      await expect(generateReviewDraft()).rejects.toThrow()
      const lastFeedback = (deps.setFeedback as Mock).mock.calls.at(-1)
      // The exact translation varies by language, but it should be the
      // "local AI not supported" message, not the generic failure.
      expect(lastFeedback?.[1]).toBe('error')
    })

    it('classifies storage-quota errors distinctly from generic failures', async () => {
      const err = new Error('quota exceeded')
      err.name = 'QuotaExceededError'
      generateLocalReviewDraftMock.mockRejectedValue(err)
      const { deps } = makeDeps({ serverReady: false })
      const { generateReviewDraft } = createAiHandlers(deps)

      await expect(generateReviewDraft()).rejects.toThrow()
      const message = (deps.setFeedback as Mock).mock.calls.at(-1)?.[0] as string
      // English translation of localModelStorageFull contains "storage" or "space".
      expect(message.toLowerCase()).toMatch(/storage|space|quota/)
    })
  })

  describe('applyReviewDraft', () => {
    it('writes the draft as the new review, refreshes state, and schedules an auto-sync', async () => {
      const { deps } = makeDeps()
      deps.reviewDraftPreview.value = '  This game changed me.  '

      const { applyReviewDraft } = createAiHandlers(deps)
      await applyReviewDraft()

      expect(deps.applyReview).toHaveBeenCalledWith('This game changed me.')
      expect(deps.reviewDraftPreview.value).toBe('')
      expect(deps.scheduleAutoSync).toHaveBeenCalledTimes(1)
    })

    it('is a no-op when there is no selected game', async () => {
      const { deps } = makeDeps({ game: null })
      deps.reviewDraftPreview.value = 'Draft'

      const { applyReviewDraft } = createAiHandlers(deps)
      await applyReviewDraft()

      expect(deps.applyReview).not.toHaveBeenCalled()
    })

    it('is a no-op when the preview is blank/whitespace', async () => {
      const { deps } = makeDeps()
      deps.reviewDraftPreview.value = '   \n\t  '

      const { applyReviewDraft } = createAiHandlers(deps)
      await applyReviewDraft()

      expect(deps.applyReview).not.toHaveBeenCalled()
    })
  })

  describe('discardReviewDraft', () => {
    it('clears the preview', () => {
      const { deps } = makeDeps()
      deps.reviewDraftPreview.value = 'Something to discard.'

      const { discardReviewDraft } = createAiHandlers(deps)
      discardReviewDraft()

      expect(deps.reviewDraftPreview.value).toBe('')
    })
  })
})
