import type { ComputedRef, Ref } from 'vue'
import { requestReviewDraft } from '../lib/syncApi'
import {
  clearLocalDraftPending,
  hasPendingLocalDraft,
  isStorageQuotaError,
  isWebGpuError,
  resolveLocalReviewModel,
  setLocalDraftPending,
} from '../lib/localReviewModels'
import { translate } from '../i18n'
import { getSyncErrorMessage } from '../lib/syncUtils'
import type { AppSettingsState } from './useSettings'
import type { FeedbackState, Game, LogEntry } from '../types'

interface AiFeaturesDeps {
  selectedGame: ComputedRef<Game | null>
  selectedJourneyId: Ref<string | null>
  logs: Ref<LogEntry[]>
  settings: AppSettingsState
  serverReviewDraftReady: ComputedRef<boolean>
  isDraftingReview: Ref<boolean>
  reviewDraftPreview: Ref<string>
  localReviewProgress: Ref<string>
  setFeedback: (message: string, tone?: FeedbackState['tone']) => void
  ensureSyncConfig: () => void
  applyReview: (review: string) => Promise<void>
  scheduleAutoSync: () => void
}

export function createAiHandlers(deps: AiFeaturesDeps) {
  const {
    selectedGame,
    selectedJourneyId,
    logs,
    settings,
    serverReviewDraftReady,
    isDraftingReview,
    reviewDraftPreview,
    localReviewProgress,
    setFeedback,
    ensureSyncConfig,
    applyReview,
    scheduleAutoSync,
  } = deps

  async function generateReviewDraft() {
    const currentGame = selectedGame.value

    if (!currentGame) {
      return
    }

    // Prefer the MioServer path when it is configured, available, and online;
    // otherwise fall back to the on-device WebLLM model.
    if (serverReviewDraftReady.value) {
      ensureSyncConfig()
      isDraftingReview.value = true

      try {
        const response = await requestReviewDraft(
          settings.syncApiBaseUrl,
          settings.syncToken,
          currentGame.id,
          selectedJourneyId.value,
          settings.language,
        )

        reviewDraftPreview.value = response.draft.trim()

        return response
      } catch (error) {
        const message = getSyncErrorMessage(error, translate(settings.language, 'feedback.reviewDraftFailed'))
        setFeedback(message, 'error')
        throw new Error(message)
      } finally {
        isDraftingReview.value = false
      }
    }

    // Crash guard: if a previous on-device attempt killed the tab (iOS OOM), its
    // pending marker is still here. Don't retry blindly — warn with a way out.
    if (hasPendingLocalDraft()) {
      clearLocalDraftPending()
      const message = translate(settings.language, 'feedback.localModelCrashed')
      setFeedback(message, 'error')
      throw new Error(message)
    }

    // Drafts follow the app language, so use a model that can actually write in it
    // (the small models are English-only — they output garbage in German).
    const modelId = resolveLocalReviewModel(settings.aiLocalReviewModel, settings.language)

    isDraftingReview.value = true
    localReviewProgress.value = ''
    setLocalDraftPending(modelId)

    try {
      const { generateLocalReviewDraft } = await import('../lib/localReviewDraft')
      const draft = await generateLocalReviewDraft({
        game: currentGame,
        logs: logs.value,
        language: settings.language,
        modelId,
        onProgress: (progress) => {
          if (progress.phase === 'loading') {
            // WebLLM reports two 0→1 passes: fetching shards, then GPU load/compile.
            // Label them distinctly so the second pass doesn't look like a re-download,
            // and show one decimal so sub-1% download activity is visible immediately.
            const percent = (progress.progress * 100).toFixed(1)
            const key = /fetch|download/i.test(progress.text)
              ? 'detail.localModelDownloading'
              : 'detail.localModelPreparing'
            localReviewProgress.value = translate(settings.language, key, { percent })
          } else {
            localReviewProgress.value = translate(settings.language, 'detail.localModelWriting')
          }
        },
      })

      reviewDraftPreview.value = draft

      return { gameId: currentGame.id, draft }
    } catch (error) {
      const messageKey = isStorageQuotaError(error)
        ? 'feedback.localModelStorageFull'
        : isWebGpuError(error)
          ? 'settings.localAiUnsupported'
          : 'feedback.reviewDraftFailed'
      const message = translate(settings.language, messageKey)
      setFeedback(message, 'error')
      throw new Error(message)
    } finally {
      // Reaching finally means we did NOT crash the tab — clear the sentinel.
      clearLocalDraftPending()
      isDraftingReview.value = false
      localReviewProgress.value = ''
    }
  }

  async function applyReviewDraft() {
    const currentGame = selectedGame.value
    const draft = reviewDraftPreview.value.trim()

    if (!currentGame || !draft) {
      return
    }

    await applyReview(draft)
    reviewDraftPreview.value = ''

    setFeedback(translate(settings.language, 'feedback.reviewDraftApplied'))
    scheduleAutoSync()
  }

  function discardReviewDraft() {
    reviewDraftPreview.value = ''
  }

  return { generateReviewDraft, applyReviewDraft, discardReviewDraft }
}
