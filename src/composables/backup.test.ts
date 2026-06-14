import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { reactive, ref } from 'vue'
import type { AppSettingsState } from './useSettings'
import type { BackupData } from '../types'

// Pin the lib boundary so the composable's orchestration is testable in isolation.
// The actual createBackupData/importBackupData round-trip is exercised in backlogDb.test.ts.
vi.mock('../lib/backlogDb', () => ({
  createBackupData: vi.fn(),
  importBackupData: vi.fn(),
}))

import { createBackupData, importBackupData } from '../lib/backlogDb'
import { createBackupHandlers } from './backup'

const createBackupDataMock = createBackupData as unknown as Mock
const importBackupDataMock = importBackupData as unknown as Mock

function makeSettings(language: 'en' | 'de' = 'en'): AppSettingsState {
  return reactive<AppSettingsState>({
    language,
    theme: 'journal',
    syncApiBaseUrl: '',
    syncToken: '',
    autoSyncEnabled: false,
    lastSyncedAt: null,
    lastSyncError: null,
    libraryViewMode: 'list',
    backupReminderEnabled: false,
    lastBackupExportedAt: null,
    backupReminderDismissedAt: null,
    aiReviewDraftAvailable: false,
    syncApiVersion: 1,
    aiLocalReviewDraftEnabled: false,
    aiLocalReviewModel: '',
  })
}

function makeDeps(overrides: Partial<Parameters<typeof createBackupHandlers>[0]> = {}) {
  return {
    selectedGameId: ref<string | null>(null),
    settings: makeSettings(),
    setFeedback: vi.fn(),
    setLastBackupExportedAt: vi.fn(),
    setBackupReminderDismissedAt: vi.fn(),
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
    loadLogs: vi.fn().mockResolvedValue(undefined),
    unlockEarnedTrophies: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as Parameters<typeof createBackupHandlers>[0]
}

const sampleBackup: BackupData = {
  version: 1,
  exportedAt: '2026-05-28T08:00:00.000Z',
  games: [],
  journeys: [],
  logs: [],
  earnedTrophies: [],
}

describe('createBackupHandlers', () => {
  beforeEach(() => {
    createBackupDataMock.mockReset()
    importBackupDataMock.mockReset()
  })

  describe('exportBackup', () => {
    it('records the export timestamp and clears the dismissed-reminder marker', async () => {
      createBackupDataMock.mockResolvedValue(sampleBackup)

      const deps = makeDeps()
      const { exportBackup } = createBackupHandlers(deps)

      const result = await exportBackup()

      expect(result).toBe(sampleBackup)
      expect(deps.setLastBackupExportedAt).toHaveBeenCalledWith('2026-05-28T08:00:00.000Z')
      // Clearing the dismissed marker means the user gets reminders again starting
      // from this fresh export, not muted forever.
      expect(deps.setBackupReminderDismissedAt).toHaveBeenCalledWith(null)
    })
  })

  describe('dismissBackupReminder', () => {
    it('stamps the dismissed-at with the current ISO time', () => {
      const deps = makeDeps()
      const { dismissBackupReminder } = createBackupHandlers(deps)

      dismissBackupReminder()

      expect(deps.setBackupReminderDismissedAt).toHaveBeenCalledTimes(1)
      const stamped = (deps.setBackupReminderDismissedAt as Mock).mock.calls[0][0] as string
      expect(stamped).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(Number.isNaN(Date.parse(stamped))).toBe(false)
    })
  })

  describe('importBackup', () => {
    it('passes payload + mode through, refreshes state, and unlocks trophies', async () => {
      importBackupDataMock.mockResolvedValue({ games: 3, logs: 7, earnedTrophies: 0 })

      const deps = makeDeps()
      const { importBackup } = createBackupHandlers(deps)

      await importBackup(sampleBackup, 'replace')

      expect(importBackupDataMock).toHaveBeenCalledWith(sampleBackup, 'replace')
      expect(deps.ensureLoaded).toHaveBeenCalledWith(true)
      // 'import' source matters — it tells the trophy engine to not fire ceremony confetti.
      expect(deps.unlockEarnedTrophies).toHaveBeenCalledWith('import')
    })

    it('uses the restored-message key on replace and the merged-message key on merge', async () => {
      importBackupDataMock.mockResolvedValue({ games: 2, logs: 4, earnedTrophies: 0 })

      const deps = makeDeps()
      const { importBackup } = createBackupHandlers(deps)

      await importBackup(sampleBackup, 'replace')
      const replaceMessage = (deps.setFeedback as Mock).mock.calls.at(-1)?.[0] as string
      expect(replaceMessage).toMatch(/restored/i)

      await importBackup(sampleBackup, 'merge')
      const mergeMessage = (deps.setFeedback as Mock).mock.calls.at(-1)?.[0] as string
      expect(mergeMessage).toMatch(/merged/i)
    })

    it('reloads logs only when a game is currently selected', async () => {
      importBackupDataMock.mockResolvedValue({ games: 1, logs: 1, earnedTrophies: 0 })

      const deps = makeDeps({ selectedGameId: ref('g1') })
      const { importBackup } = createBackupHandlers(deps)
      await importBackup(sampleBackup, 'merge')
      expect(deps.loadLogs).toHaveBeenCalledWith('g1')

      const depsNoSelection = makeDeps()
      const { importBackup: importBackupNoSel } = createBackupHandlers(depsNoSelection)
      await importBackupNoSel(sampleBackup, 'merge')
      expect(depsNoSelection.loadLogs).not.toHaveBeenCalled()
    })

    it('formats the feedback message in the active language', async () => {
      importBackupDataMock.mockResolvedValue({ games: 5, logs: 9, earnedTrophies: 0 })

      const deps = makeDeps({ settings: makeSettings('de') })
      const { importBackup } = createBackupHandlers(deps)

      await importBackup(sampleBackup, 'replace')

      const message = (deps.setFeedback as Mock).mock.calls.at(-1)?.[0] as string
      // German feedback says "Spiele" / "Logs" — confirms the language plumb-through.
      expect(message).toMatch(/Spiele/)
      expect(message).toContain('5')
      expect(message).toContain('9')
    })

    it('rejects replacement while sync is configured without touching local data', async () => {
      const settings = makeSettings()
      settings.syncApiBaseUrl = 'https://miolog.example.test'
      settings.syncToken = 'secret'
      const deps = makeDeps({ settings })
      const { importBackup } = createBackupHandlers(deps)

      await expect(importBackup(sampleBackup, 'replace')).rejects.toThrow(/disconnect sync/i)

      expect(importBackupDataMock).not.toHaveBeenCalled()
      expect(deps.ensureLoaded).not.toHaveBeenCalled()
    })

    it('still allows merge imports while sync is configured', async () => {
      importBackupDataMock.mockResolvedValue({ games: 1, logs: 0, earnedTrophies: 0 })
      const settings = makeSettings()
      settings.syncApiBaseUrl = 'https://miolog.example.test'
      settings.syncToken = 'secret'
      const deps = makeDeps({ settings })
      const { importBackup } = createBackupHandlers(deps)

      await importBackup(sampleBackup, 'merge')

      expect(importBackupDataMock).toHaveBeenCalledWith(sampleBackup, 'merge')
    })
  })
})
