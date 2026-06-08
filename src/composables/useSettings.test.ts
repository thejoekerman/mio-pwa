import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { DEFAULT_LOCAL_REVIEW_MODEL } from '../lib/localReviewModels'

// `useSettings` exports a module-level singleton built at import time. To exercise
// the stored-state hydration and the demo-mode reset path, each test resets the
// module registry and re-imports with a tailored localStorage + appMode mock.

const STORAGE_KEY = 'miolog-settings'

async function loadSettings(opts: { stored?: unknown; demoMode?: boolean; navLanguages?: string[] } = {}) {
  const { stored, demoMode = false, navLanguages = ['en-US'] } = opts

  vi.resetModules()

  // localStorage is shared across tests; clear and seed before each load.
  window.localStorage.clear()
  if (stored !== undefined) {
    window.localStorage.setItem(
      demoMode ? 'miolog-demo-settings' : STORAGE_KEY,
      typeof stored === 'string' ? stored : JSON.stringify(stored),
    )
  }

  Object.defineProperty(navigator, 'languages', { value: navLanguages, configurable: true })

  vi.doMock('../lib/appMode', () => ({
    isDemoMode: demoMode,
    isDesktopMode: false,
    appDisplayName: demoMode ? 'MioLog Demo' : 'MioLog',
  }))

  return await import('./useSettings')
}

describe('useSettings', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.doUnmock('../lib/appMode')
    vi.resetModules()
  })

  describe('initial state', () => {
    it('uses defaults when nothing is stored', async () => {
      const { useSettings } = await loadSettings()
      const { settings } = useSettings()

      expect(settings.theme).toBe('journal')
      expect(settings.syncApiBaseUrl).toBe('')
      expect(settings.syncToken).toBe('')
      expect(settings.autoSyncEnabled).toBe(false)
      expect(settings.syncApiVersion).toBe(1)
      expect(settings.libraryViewMode).toBe('list')
      expect(settings.backupReminderEnabled).toBe(true)
      expect(settings.aiLocalReviewModel).toBe(DEFAULT_LOCAL_REVIEW_MODEL)
    })

    it('detects German from navigator.languages', async () => {
      const { useSettings } = await loadSettings({ navLanguages: ['de-DE', 'en'] })
      expect(useSettings().settings.language).toBe('de')
    })

    it('falls back to English for unknown locales', async () => {
      const { useSettings } = await loadSettings({ navLanguages: ['fr-FR'] })
      expect(useSettings().settings.language).toBe('en')
    })
  })

  describe('hydration from localStorage', () => {
    it('restores valid stored fields', async () => {
      const { useSettings } = await loadSettings({
        stored: {
          language: 'de',
          theme: 'mio',
          syncApiBaseUrl: 'https://server.test',
          syncToken: 'abc',
          autoSyncEnabled: true,
          libraryViewMode: 'shelf',
          backupReminderEnabled: false,
          lastSyncedAt: '2026-05-01T00:00:00.000Z',
          syncApiVersion: 2,
        },
      })
      const { settings } = useSettings()

      expect(settings.language).toBe('de')
      expect(settings.theme).toBe('mio')
      expect(settings.syncApiBaseUrl).toBe('https://server.test')
      expect(settings.syncToken).toBe('abc')
      expect(settings.autoSyncEnabled).toBe(true)
      expect(settings.libraryViewMode).toBe('shelf')
      expect(settings.backupReminderEnabled).toBe(false)
      expect(settings.lastSyncedAt).toBe('2026-05-01T00:00:00.000Z')
      expect(settings.syncApiVersion).toBe(2)
    })

    it('rejects invalid enum values and falls back to defaults', async () => {
      const { useSettings } = await loadSettings({
        stored: { language: 'xx', theme: 'not-a-theme', libraryViewMode: 'mosaic' },
      })
      const { settings } = useSettings()

      // language re-detects from navigator (defaults to 'en' here)
      expect(settings.language).toBe('en')
      expect(settings.theme).toBe('journal')
      expect(settings.libraryViewMode).toBe('list')
    })

    it('rejects unknown aiLocalReviewModel ids', async () => {
      const { useSettings } = await loadSettings({
        stored: { aiLocalReviewModel: 'imaginary-model-99B' },
      })
      expect(useSettings().settings.aiLocalReviewModel).toBe(DEFAULT_LOCAL_REVIEW_MODEL)
    })

    it('survives a corrupted JSON blob', async () => {
      const { useSettings } = await loadSettings({ stored: '{not valid json' })
      const { settings } = useSettings()

      // Should fall back to defaults without throwing.
      expect(settings.theme).toBe('journal')
      expect(settings.syncApiBaseUrl).toBe('')
    })

    it('keeps an explicit null for lastSyncedAt over the default', async () => {
      // The reader distinguishes `null` from `undefined` for nullable date fields
      // — this guards against accidentally falling back to a stale value on null.
      const { useSettings } = await loadSettings({
        stored: { lastSyncedAt: null, lastBackupExportedAt: null },
      })
      const { settings } = useSettings()
      expect(settings.lastSyncedAt).toBeNull()
      expect(settings.lastBackupExportedAt).toBeNull()
    })
  })

  describe('demo mode', () => {
    it('wipes sync + backup-reminder fields even if they were persisted', async () => {
      const { useSettings } = await loadSettings({
        demoMode: true,
        stored: {
          syncApiBaseUrl: 'https://leaked.test',
          syncToken: 'leaked',
          autoSyncEnabled: true,
          backupReminderEnabled: true,
          aiReviewDraftAvailable: true,
          igdbMetadataAvailable: true,
          syncApiVersion: 2,
        },
      })
      const { settings } = useSettings()

      expect(settings.syncApiBaseUrl).toBe('')
      expect(settings.syncToken).toBe('')
      expect(settings.autoSyncEnabled).toBe(false)
      expect(settings.backupReminderEnabled).toBe(false)
      expect(settings.aiReviewDraftAvailable).toBe(false)
      expect(settings.igdbMetadataAvailable).toBe(false)
      expect(settings.syncApiVersion).toBe(1)
    })
  })

  describe('setters and persistence', () => {
    it('resets the known sync API version when the sync endpoint changes', async () => {
      const { useSettings } = await loadSettings({
        stored: {
          syncApiBaseUrl: 'https://v2.test',
          syncToken: 'token',
          syncApiVersion: 2,
        },
      })
      const { settings } = useSettings()

      settings.syncApiBaseUrl = 'https://unknown.test'
      await nextTick()

      expect(settings.syncApiVersion).toBe(1)
    })

    it('writes back to localStorage on any change', async () => {
      const { useSettings } = await loadSettings()
      const { setLanguage, setLastSyncedAt } = useSettings()

      setLanguage('de')
      setLastSyncedAt('2026-05-28T00:00:00.000Z')
      await nextTick()

      const raw = window.localStorage.getItem(STORAGE_KEY)
      expect(raw).not.toBeNull()
      const parsed = JSON.parse(raw!) as Record<string, unknown>
      expect(parsed.language).toBe('de')
      expect(parsed.lastSyncedAt).toBe('2026-05-28T00:00:00.000Z')
    })

    it('sets the documentElement lang and theme on language/theme change', async () => {
      const { useSettings } = await loadSettings()
      const { setLanguage, setTheme } = useSettings()

      setLanguage('de')
      setTheme('mio')
      await nextTick()

      expect(document.documentElement.lang).toBe('de')
      expect(document.documentElement.dataset.theme).toBe('mio')
    })

    it('rejects invalid aiLocalReviewModel ids without mutating state', async () => {
      const { useSettings } = await loadSettings()
      const { setAiLocalReviewModel, settings } = useSettings()
      const before = settings.aiLocalReviewModel

      setAiLocalReviewModel('not-a-real-model')

      expect(settings.aiLocalReviewModel).toBe(before)
    })
  })
})
