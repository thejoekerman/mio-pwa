import type { Ref } from 'vue'
import { createSyncSnapshot, replaceWithSyncSnapshot } from '../lib/backlogDb'
import { syncWithBackend, testSyncConnection as requestSyncConnection } from '../lib/syncApi'
import { translate } from '../i18n'
import { getSyncErrorMessage } from '../lib/syncUtils'
import { isDemoMode } from '../lib/appMode'
import { isOnline } from '../lib/network'
import type { AppSettingsState } from './useSettings'
import type { EarnedTrophy, FeedbackState, Game, GameFormState, SyncSnapshot, TrophyUnlockSource } from '../types'

interface SyncDeps {
  games: Ref<Game[]>
  selectedGameId: Ref<string | null>
  gameForm: GameFormState
  isSyncing: Ref<boolean>
  isTestingSyncConnection: Ref<boolean>
  autoSyncStarted: Ref<boolean>
  capabilityRefreshStarted: Ref<boolean>
  localChangeRevision: Ref<number>
  settings: AppSettingsState
  ensureLoaded: (force?: boolean) => Promise<void>
  loadLogs: (gameId: string | null) => Promise<void>
  unlockEarnedTrophies: (source: TrophyUnlockSource) => Promise<EarnedTrophy[]>
  editGame: (game: Game) => void
  resetForm: () => void
  setFeedback: (message: string, tone?: FeedbackState['tone']) => void
  setAiReviewDraftAvailable: (value: boolean) => void
  setIgdbMetadataAvailable: (value: boolean) => void
  setLastSyncedAt: (value: string | null) => void
  setLastSyncError: (value: string | null) => void
}

function snapshotSignature(records: { id: string; updatedAt: string }[]): string {
  return records
    .map((record) => `${record.id}@${record.updatedAt}`)
    .sort()
    .join('|')
}

function snapshotsMatch(local: SyncSnapshot, remote: SyncSnapshot): boolean {
  return (
    snapshotSignature(local.games) === snapshotSignature(remote.games) &&
    snapshotSignature(local.logs) === snapshotSignature(remote.logs) &&
    snapshotSignature(local.earnedTrophies) === snapshotSignature(remote.earnedTrophies)
  )
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
    localChangeRevision,
    settings,
    ensureLoaded,
    loadLogs,
    unlockEarnedTrophies,
    editGame,
    resetForm,
    setFeedback,
    setAiReviewDraftAvailable,
    setIgdbMetadataAvailable,
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

  function canAttemptSync() {
    return (
      !isDemoMode &&
      settings.syncApiBaseUrl.trim().length > 0 &&
      settings.syncToken.trim().length > 0 &&
      isOnline()
    )
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
    const syncStartedAtRevision = localChangeRevision.value
    const snapshot = await createSyncSnapshot()
    const response = await syncWithBackend(
      settings.syncApiBaseUrl,
      settings.syncToken,
      snapshot,
    )

    if (syncStartedAtRevision !== localChangeRevision.value) {
      if (!options?.silentSuccess) {
        setFeedback(translate(settings.language, 'feedback.syncSkippedLocalChanges'), 'info')
      }

      return response
    }

    const remoteSnapshot: SyncSnapshot = {
      games: response.games,
      logs: response.logs,
      earnedTrophies: response.earnedTrophies ?? snapshot.earnedTrophies,
    }

    // Nothing changed on either side — skip the full clear/rebuild + reload + trophy re-eval.
    if (snapshotsMatch(snapshot, remoteSnapshot)) {
      setLastSyncedAt(response.syncedAt)
      setLastSyncError(null)

      if (!options?.silentSuccess) {
        setFeedback(
          translate(settings.language, 'feedback.syncCompleted', {
            games: snapshot.games.filter((game) => game.deletedAt === null).length,
            logs: snapshot.logs.filter((logEntry) => logEntry.deletedAt === null).length,
          }),
        )
      }

      return response
    }

    await replaceWithSyncSnapshot(remoteSnapshot)
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

    setLastSyncedAt(response.syncedAt)
    setLastSyncError(null)

    if (!options?.silentSuccess) {
      setFeedback(
        translate(settings.language, 'feedback.syncCompleted', {
          games: response.games.filter((game) => game.deletedAt === null).length,
          logs: response.logs.filter((logEntry) => logEntry.deletedAt === null).length,
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
      setIgdbMetadataAvailable(response.capabilities.igdbMetadata ?? true)
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
    if (capabilityRefreshStarted.value || !canAttemptSync()) {
      return
    }

    capabilityRefreshStarted.value = true

    try {
      const response = await requestSyncConnection(
        settings.syncApiBaseUrl,
        settings.syncToken,
      )

      setAiReviewDraftAvailable(response.capabilities.reviewDraft)
      setIgdbMetadataAvailable(response.capabilities.igdbMetadata ?? true)
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

      if (options?.source !== 'auto') {
        try {
          const connection = await requestSyncConnection(
            settings.syncApiBaseUrl,
            settings.syncToken,
          )
          setAiReviewDraftAvailable(connection.capabilities.reviewDraft)
          setIgdbMetadataAvailable(connection.capabilities.igdbMetadata ?? true)
        } catch {
          // Keep the latest known capability state when the refresh call fails.
        }
      }

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
