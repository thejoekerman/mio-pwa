import type { Ref } from 'vue'
import { createBackupData, importBackupData } from '../lib/backlogDb'
import { translate } from '../i18n'
import type { AppSettingsState } from './useSettings'
import type { BackupImportMode, EarnedTrophy, FeedbackState, TrophyUnlockSource } from '../types'

interface BackupDeps {
  selectedGameId: Ref<string | null>
  settings: AppSettingsState
  setFeedback: (message: string, tone?: FeedbackState['tone']) => void
  setLastBackupExportedAt: (value: string) => void
  setBackupReminderDismissedAt: (value: string | null) => void
  ensureLoaded: (force?: boolean) => Promise<void>
  loadLogs: (gameId: string | null) => Promise<void>
  unlockEarnedTrophies: (source: TrophyUnlockSource) => Promise<EarnedTrophy[]>
}

export function createBackupHandlers(deps: BackupDeps) {
  const {
    selectedGameId,
    settings,
    setFeedback,
    setLastBackupExportedAt,
    setBackupReminderDismissedAt,
    ensureLoaded,
    loadLogs,
    unlockEarnedTrophies,
  } = deps

  async function exportBackup() {
    const payload = await createBackupData()

    setLastBackupExportedAt(payload.exportedAt)
    setBackupReminderDismissedAt(null)

    return payload
  }

  function dismissBackupReminder() {
    setBackupReminderDismissedAt(new Date().toISOString())
  }

  async function importBackup(payload: unknown, mode: BackupImportMode) {
    const result = await importBackupData(payload, mode)

    await ensureLoaded(true)
    await unlockEarnedTrophies('import')

    if (selectedGameId.value) {
      await loadLogs(selectedGameId.value)
    }

    setFeedback(
      translate(
        settings.language,
        mode === 'replace' ? 'feedback.backupRestored' : 'feedback.backupMerged',
        {
          games: result.games,
          logs: result.logs,
        },
      ),
    )

    return result
  }

  return { exportBackup, dismissBackupReminder, importBackup }
}
