import type { Ref } from 'vue'
import { applySyncResponse, createSyncRequest } from '../lib/backlogDb'
import { syncWithBackend, testSyncConnection as requestSyncConnection } from '../lib/syncApi'
import { translate } from '../i18n'
import { getSyncErrorMessage } from '../lib/syncUtils'
import { isDemoMode } from '../lib/appMode'
import { isOnline } from '../lib/network'
import type { AppSettingsState } from './useSettings'
import type { EarnedTrophy, FeedbackState, Game, GameFormState, TrophyUnlockSource } from '../types'

interface SyncDeps {
  games: Ref<Game[]>
  selectedGameId: Ref<string | null>
  gameForm: GameFormState
  isSyncing: Ref<boolean>
  isTestingSyncConnection: Ref<boolean>
  autoSyncStarted: Ref<boolean>
  capabilityRefreshStarted: Ref<boolean>
  settings: AppSettingsState
  ensureLoaded: (force?: boolean) => Promise<void>
  loadLogs: (gameId: string | null) => Promise<void>
  unlockEarnedTrophies: (source: TrophyUnlockSource) => Promise<EarnedTrophy[]>
  editGame: (game: Game) => void
  resetForm: () => void
  setFeedback: (message: string, tone?: FeedbackState['tone']) => void
  setAiReviewDraftAvailable: (value: boolean) => void
  setSyncApiVersion: (value: number) => void
  setLastSyncedAt: (value: string | null) => void
  setLastSyncError: (value: string | null) => void
}

function syncServerIdentity(apiBaseUrl: string, userId: number) {
  return `${apiBaseUrl.trim().replace(/\/+$/, '')}|user:${userId}`
}

export function createSyncHandlers(deps: SyncDeps) {
  const {
    games,
    selectedGameId,
    gameForm,
    isSyncing,
    isTestingSyncConnection,
    autoSyncStarted,
    capabilityRefreshStarted,
    settings,
    ensureLoaded,
    loadLogs,
    unlockEarnedTrophies,
    editGame,
    resetForm,
    setFeedback,
    setAiReviewDraftAvailable,
    setSyncApiVersion,
    setLastSyncedAt,
    setLastSyncError,
  } = deps

  let autoSyncTimer: number | null = null

  function ensureSyncConfig() {
    if (!settings.syncApiBaseUrl.trim()) {
      throw new Error(translate(settings.language, 'feedback.syncUrlMissing'))
    }

    if (!settings.syncToken.trim()) {
      throw new Error(translate(settings.language, 'feedback.syncTokenMissing'))
    }
  }

  function canRequestConnection() {
    return (
      !isDemoMode &&
      settings.syncApiBaseUrl.trim().length > 0 &&
      settings.syncToken.trim().length > 0 &&
      isOnline()
    )
  }

  function canAttemptSync() {
    return canRequestConnection() && settings.syncApiVersion >= 2
  }

  function scheduleAutoSync(delay = 1400) {
    if (!settings.autoSyncEnabled || !canAttemptSync() || typeof window === 'undefined') {
      return
    }

    if (autoSyncTimer !== null) {
      window.clearTimeout(autoSyncTimer)
    }

    autoSyncTimer = window.setTimeout(() => {
      autoSyncTimer = null

      if (!settings.autoSyncEnabled || !canAttemptSync() || isSyncing.value) {
        return
      }

      void syncNow({
        source: 'auto',
        silentSuccess: true,
        errorFeedback: false,
      })
    }, delay)
  }

  async function performSync(options?: { silentSuccess?: boolean }) {
    await ensureLoaded()
    const connection = await requestSyncConnection(
      settings.syncApiBaseUrl,
      settings.syncToken,
    )
    const syncApiVersion = connection.version ?? 1
    setAiReviewDraftAvailable(connection.capabilities.reviewDraft)
    setSyncApiVersion(syncApiVersion)

    if (syncApiVersion < 2) {
      throw new Error(translate(settings.language, 'feedback.syncVersionBlocked'))
    }

    const serverIdentity = syncServerIdentity(settings.syncApiBaseUrl, connection.user.id)
    const prepared = await createSyncRequest(serverIdentity)
    const response = await syncWithBackend(
      settings.syncApiBaseUrl,
      settings.syncToken,
      prepared.request,
    )
    await applySyncResponse(serverIdentity, prepared.submitted, response)

    const receivedChanges =
      response.changes.games.length +
      response.changes.journeys.length +
      response.changes.logs.length +
      response.changes.earnedTrophies.length

    if (receivedChanges > 0) {
      await ensureLoaded(true)

      if (selectedGameId.value) {
        await loadLogs(selectedGameId.value)
      }

      await unlockEarnedTrophies('sync')

      if (gameForm.id) {
        const refreshedGame = games.value.find((game) => game.id === gameForm.id)

        if (refreshedGame) {
          editGame(refreshedGame)
        } else {
          resetForm()
        }
      }
    }

    setLastSyncedAt(response.syncedAt)
    setLastSyncError(null)

    if (!options?.silentSuccess) {
      setFeedback(
        translate(settings.language, 'feedback.syncCompleted', {
          games: response.totals.games,
          logs: response.totals.logs,
        }),
      )
    }

    return response
  }

  function startAutoSync() {
    if (autoSyncStarted.value || typeof window === 'undefined') {
      return
    }

    autoSyncStarted.value = true

    window.addEventListener('focus', () => {
      if (!settings.autoSyncEnabled || !canAttemptSync() || isSyncing.value) {
        return
      }

      void syncNow({
        source: 'auto',
        silentSuccess: true,
        errorFeedback: false,
      })
    })

    window.addEventListener('online', () => {
      if (!settings.autoSyncEnabled || !canAttemptSync() || isSyncing.value) {
        return
      }

      void syncNow({
        source: 'auto',
        silentSuccess: true,
        errorFeedback: false,
      })
    })

    if (settings.autoSyncEnabled && canAttemptSync()) {
      void syncNow({
        source: 'auto',
        silentSuccess: true,
        errorFeedback: false,
      })
    }
  }

  async function testSyncConnection() {
    isTestingSyncConnection.value = true

    try {
      ensureSyncConfig()
      const response = await requestSyncConnection(
        settings.syncApiBaseUrl,
        settings.syncToken,
      )

      setFeedback(
        translate(settings.language, 'feedback.syncConnectionOk', {
          name: response.user.displayName || response.user.email || `#${response.user.id}`,
        }),
      )
      setAiReviewDraftAvailable(response.capabilities.reviewDraft)
      setSyncApiVersion(response.version ?? 1)
      setLastSyncError(null)

      return response
    } catch (error) {
      const message = getSyncErrorMessage(error, translate(settings.language, 'feedback.syncConnectionFailed'))

      setLastSyncError(message)
      setFeedback(message, 'error')
      throw new Error(message)
    } finally {
      isTestingSyncConnection.value = false
    }
  }

  async function refreshSyncCapabilities() {
    if (capabilityRefreshStarted.value || !canRequestConnection()) {
      return
    }

    capabilityRefreshStarted.value = true

    try {
      const response = await requestSyncConnection(
        settings.syncApiBaseUrl,
        settings.syncToken,
      )

      setAiReviewDraftAvailable(response.capabilities.reviewDraft)
      setSyncApiVersion(response.version ?? 1)
    } catch {
      // Keep the latest known capability state when the startup refresh fails.
    }
  }

  async function syncNow(options?: {
    source?: 'manual' | 'auto'
    silentSuccess?: boolean
    errorFeedback?: boolean
  }) {
    isSyncing.value = true

    try {
      ensureSyncConfig()
      const response = await performSync({
        silentSuccess: options?.silentSuccess,
      })

      return response
    } catch (error) {
      const message = getSyncErrorMessage(error, translate(settings.language, 'feedback.syncFailed'))

      setLastSyncError(message)

      if (options?.errorFeedback !== false) {
        setFeedback(message, 'error')
      }

      throw new Error(message)
    } finally {
      isSyncing.value = false
    }
  }

  return {
    ensureSyncConfig,
    scheduleAutoSync,
    startAutoSync,
    testSyncConnection,
    refreshSyncCapabilities,
    syncNow,
  }
}
