import { reactive, watch } from 'vue'
import {
  APP_LANGUAGES,
  APP_THEMES,
  LIBRARY_VIEW_MODES,
  type AppLanguage,
  type AppTheme,
  type LibraryViewMode,
} from '../types'
import { isDemoMode } from '../lib/appMode'

const SETTINGS_STORAGE_KEY = isDemoMode ? 'miolog-demo-settings' : 'miolog-settings'

export interface AppSettingsState {
  language: AppLanguage
  theme: AppTheme
  syncApiBaseUrl: string
  syncToken: string
  autoSyncEnabled: boolean
  lastSyncedAt: string | null
  lastSyncError: string | null
  libraryViewMode: LibraryViewMode
  backupReminderEnabled: boolean
  lastBackupExportedAt: string | null
  backupReminderDismissedAt: string | null
  aiReviewDraftAvailable: boolean
  aiPlayNextAvailable: boolean
  igdbMetadataAvailable: boolean
}

function detectBrowserLanguage(): AppLanguage {
  if (typeof navigator === 'undefined') {
    return 'en'
  }

  const candidates = [...(navigator.languages ?? []), navigator.language].filter(Boolean)

  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase()

    if (normalized.startsWith('de')) {
      return 'de'
    }
  }

  return 'en'
}

function readStoredSettings(): Partial<AppSettingsState> {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)

    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw) as Partial<AppSettingsState>
    const nextState: Partial<AppSettingsState> = {}

    if (parsed.language && APP_LANGUAGES.includes(parsed.language)) {
      nextState.language = parsed.language
    }

    if (parsed.theme && APP_THEMES.includes(parsed.theme)) {
      nextState.theme = parsed.theme
    }

    if (typeof parsed.syncApiBaseUrl === 'string') {
      nextState.syncApiBaseUrl = parsed.syncApiBaseUrl
    }

    if (typeof parsed.syncToken === 'string') {
      nextState.syncToken = parsed.syncToken
    }

    if (typeof parsed.autoSyncEnabled === 'boolean') {
      nextState.autoSyncEnabled = parsed.autoSyncEnabled
    }

    if (typeof parsed.lastSyncedAt === 'string') {
      nextState.lastSyncedAt = parsed.lastSyncedAt
    } else if (parsed.lastSyncedAt === null) {
      nextState.lastSyncedAt = null
    }

    if (typeof parsed.lastSyncError === 'string') {
      nextState.lastSyncError = parsed.lastSyncError
    } else if (parsed.lastSyncError === null) {
      nextState.lastSyncError = null
    }

    if (parsed.libraryViewMode && LIBRARY_VIEW_MODES.includes(parsed.libraryViewMode)) {
      nextState.libraryViewMode = parsed.libraryViewMode
    }

    if (typeof parsed.backupReminderEnabled === 'boolean') {
      nextState.backupReminderEnabled = parsed.backupReminderEnabled
    }

    if (typeof parsed.lastBackupExportedAt === 'string') {
      nextState.lastBackupExportedAt = parsed.lastBackupExportedAt
    } else if (parsed.lastBackupExportedAt === null) {
      nextState.lastBackupExportedAt = null
    }

    if (typeof parsed.backupReminderDismissedAt === 'string') {
      nextState.backupReminderDismissedAt = parsed.backupReminderDismissedAt
    } else if (parsed.backupReminderDismissedAt === null) {
      nextState.backupReminderDismissedAt = null
    }

    if (typeof parsed.aiReviewDraftAvailable === 'boolean') {
      nextState.aiReviewDraftAvailable = parsed.aiReviewDraftAvailable
    }

    if (typeof parsed.aiPlayNextAvailable === 'boolean') {
      nextState.aiPlayNextAvailable = parsed.aiPlayNextAvailable
    }

    if (typeof parsed.igdbMetadataAvailable === 'boolean') {
      nextState.igdbMetadataAvailable = parsed.igdbMetadataAvailable
    }

    return nextState
  } catch {
    return {}
  }
}

function createSettingsStore() {
  const stored = readStoredSettings()
  const settings = reactive<AppSettingsState>({
    language: stored.language ?? detectBrowserLanguage(),
    theme: stored.theme ?? 'journal',
    syncApiBaseUrl: stored.syncApiBaseUrl ?? '',
    syncToken: stored.syncToken ?? '',
    autoSyncEnabled: isDemoMode ? false : stored.autoSyncEnabled ?? false,
    lastSyncedAt: stored.lastSyncedAt ?? null,
    lastSyncError: stored.lastSyncError ?? null,
    libraryViewMode: stored.libraryViewMode ?? 'list',
    backupReminderEnabled: isDemoMode ? false : stored.backupReminderEnabled ?? true,
    lastBackupExportedAt: stored.lastBackupExportedAt ?? null,
    backupReminderDismissedAt: stored.backupReminderDismissedAt ?? null,
    aiReviewDraftAvailable: stored.aiReviewDraftAvailable ?? false,
    aiPlayNextAvailable: stored.aiPlayNextAvailable ?? false,
    igdbMetadataAvailable: stored.igdbMetadataAvailable ?? false,
  })

  watch(
    settings,
    (value) => {
      if (typeof document !== 'undefined') {
        document.documentElement.lang = value.language
        document.documentElement.dataset.theme = value.theme
      }

      if (typeof window === 'undefined') {
        return
      }

      if (isDemoMode) {
        value.syncApiBaseUrl = ''
        value.syncToken = ''
        value.autoSyncEnabled = false
        value.lastSyncedAt = null
        value.lastSyncError = null
        value.backupReminderEnabled = false
        value.lastBackupExportedAt = null
        value.backupReminderDismissedAt = null
        value.aiReviewDraftAvailable = false
        value.aiPlayNextAvailable = false
        value.igdbMetadataAvailable = false
      }

      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(value))
    },
    { deep: true, immediate: true },
  )

  function setLanguage(language: AppLanguage) {
    settings.language = language
  }

  function setTheme(theme: AppTheme) {
    settings.theme = theme
  }

  function setAutoSyncEnabled(value: boolean) {
    settings.autoSyncEnabled = value
  }

  function setLastSyncedAt(value: string | null) {
    settings.lastSyncedAt = value
  }

  function setLastSyncError(value: string | null) {
    settings.lastSyncError = value
  }

  function setLibraryViewMode(value: LibraryViewMode) {
    settings.libraryViewMode = value
  }

  function setLastBackupExportedAt(value: string | null) {
    settings.lastBackupExportedAt = value
  }

  function setBackupReminderDismissedAt(value: string | null) {
    settings.backupReminderDismissedAt = value
  }

  function setAiReviewDraftAvailable(value: boolean) {
    settings.aiReviewDraftAvailable = value
  }

  function setAiPlayNextAvailable(value: boolean) {
    settings.aiPlayNextAvailable = value
  }

  function setIgdbMetadataAvailable(value: boolean) {
    settings.igdbMetadataAvailable = value
  }

  return {
    setAiPlayNextAvailable,
    setAiReviewDraftAvailable,
    setIgdbMetadataAvailable,
    setAutoSyncEnabled,
    setBackupReminderDismissedAt,
    setLanguage,
    setTheme,
    setLastBackupExportedAt,
    setLibraryViewMode,
    setLastSyncError,
    setLastSyncedAt,
    settings,
  }
}

const settingsStore = createSettingsStore()

export function useSettings() {
  return settingsStore
}
