import type { ComputedRef, Ref } from 'vue'
import { getLogsForGame, saveGame } from '../lib/backlogDb'
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
import { getNextUpdatedAt } from '../lib/dateUtils'
import type { AppSettingsState } from './useSettings'
import type { FeedbackState, Game, GameFormState } from '../types'

interface AiFeaturesDeps {
  selectedGame: ComputedRef<Game | null>
  gameForm: GameFormState
  settings: AppSettingsState
  serverReviewDraftReady: ComputedRef<boolean>
  isDraftingReview: Ref<boolean>
  reviewDraftPreview: Ref<string>
  localReviewProgress: Ref<string>
  setFeedback: (message: string, tone?: FeedbackState['tone']) => void
  ensureSyncConfig: () => void
  toPlainGame: (game: Game) => Game
  updateGameInPlace: (game: Game) => void
  selectGame: (gameId: string | null) => Promise<void>
  editGame: (game: Game) => void
  markLocalChange: () => void
  scheduleAutoSync: () => void
}

export function createAiHandlers(deps: AiFeaturesDeps) {
  const {
    selectedGame,
    gameForm,
    settings,
    serverReviewDraftReady,
    isDraftingReview,
    reviewDraftPreview,
    localReviewProgress,
    setFeedback,
    ensureSyncConfig,
    toPlainGame,
    updateGameInPlace,
    selectGame,
    editGame,
    markLocalChange,
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
      const logs = await getLogsForGame(currentGame.id)
      const draft = await generateLocalReviewDraft({
        game: currentGame,
        logs,
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

    const currentGamePlain = toPlainGame(currentGame)
    const updatedGame: Game = {
      ...currentGamePlain,
      review: draft,
      updatedAt: getNextUpdatedAt(currentGamePlain.updatedAt),
    }

    await saveGame(updatedGame)
    markLocalChange()
    reviewDraftPreview.value = ''
    updateGameInPlace(updatedGame)
    await selectGame(updatedGame.id)

    if (gameForm.id === updatedGame.id) {
      editGame(updatedGame)
    }

    setFeedback(translate(settings.language, 'feedback.reviewDraftApplied'))
    scheduleAutoSync()
  }

  function discardReviewDraft() {
    reviewDraftPreview.value = ''
  }

  return { generateReviewDraft, applyReviewDraft, discardReviewDraft }
}
