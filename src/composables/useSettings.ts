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
import { DEFAULT_LOCAL_REVIEW_MODEL, isLocalReviewModelId } from '../lib/localReviewModels'
import {
  DEFAULT_PLAY_LOG_SHARE_HASHTAGS,
  DEFAULT_PLAY_LOG_SHARE_TEMPLATE,
} from '../lib/playLogShare'

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
  syncApiVersion: number
  aiLocalReviewDraftEnabled: boolean
  aiLocalReviewModel: string
  playLogShareTemplate: string
  playLogShareHashtags: string
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

    if (normalized.startsWith('ja')) {
      return 'ja'
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


    if (typeof parsed.syncApiVersion === 'number' && parsed.syncApiVersion >= 1) {
      nextState.syncApiVersion = Math.floor(parsed.syncApiVersion)
    }

    if (typeof parsed.aiLocalReviewDraftEnabled === 'boolean') {
      nextState.aiLocalReviewDraftEnabled = parsed.aiLocalReviewDraftEnabled
    }

    if (typeof parsed.aiLocalReviewModel === 'string' && isLocalReviewModelId(parsed.aiLocalReviewModel)) {
      nextState.aiLocalReviewModel = parsed.aiLocalReviewModel
    }

    if (typeof parsed.playLogShareTemplate === 'string' && parsed.playLogShareTemplate.trim()) {
      nextState.playLogShareTemplate = parsed.playLogShareTemplate
    }

    if (typeof parsed.playLogShareHashtags === 'string') {
      nextState.playLogShareHashtags = parsed.playLogShareHashtags
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
    syncApiVersion: stored.syncApiVersion ?? 1,
    aiLocalReviewDraftEnabled: stored.aiLocalReviewDraftEnabled ?? false,
    aiLocalReviewModel: stored.aiLocalReviewModel ?? DEFAULT_LOCAL_REVIEW_MODEL,
    playLogShareTemplate: stored.playLogShareTemplate ?? DEFAULT_PLAY_LOG_SHARE_TEMPLATE,
    playLogShareHashtags: stored.playLogShareHashtags ?? DEFAULT_PLAY_LOG_SHARE_HASHTAGS,
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
        value.syncApiVersion = 1
      }

      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(value))
    },
    { deep: true, immediate: true },
  )

  watch(
    () => [settings.syncApiBaseUrl, settings.syncToken],
    ([apiBaseUrl, syncToken], [previousApiBaseUrl, previousSyncToken]) => {
      if (apiBaseUrl !== previousApiBaseUrl || syncToken !== previousSyncToken) {
        settings.syncApiVersion = 1
      }
    },
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

  function setSyncApiVersion(value: number) {
    settings.syncApiVersion = Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1
  }

  function setAiLocalReviewDraftEnabled(value: boolean) {
    settings.aiLocalReviewDraftEnabled = value
  }

  function setAiLocalReviewModel(value: string) {
    if (isLocalReviewModelId(value)) {
      settings.aiLocalReviewModel = value
    }
  }

  function setPlayLogShareSettings(template: string, hashtags: string) {
    settings.playLogShareTemplate = template.trim() || DEFAULT_PLAY_LOG_SHARE_TEMPLATE
    settings.playLogShareHashtags = hashtags.trim()
  }

  return {
    setAiLocalReviewDraftEnabled,
    setAiLocalReviewModel,
    setAiReviewDraftAvailable,
    setPlayLogShareSettings,
    setSyncApiVersion,
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
