import type { ComputedRef, Ref } from 'vue'
import { saveGame } from '../lib/backlogDb'
import { requestReviewDraft, requestPlayNextRecommendation } from '../lib/syncApi'
import { translate } from '../i18n'
import { getSyncErrorMessage } from '../lib/syncUtils'
import { getNextUpdatedAt } from '../lib/dateUtils'
import type { AppSettingsState } from './useSettings'
import type {
  FeedbackState,
  Game,
  GameFormState,
  PlayNextRecommendationResponse,
} from '../types'

interface AiFeaturesDeps {
  selectedGame: ComputedRef<Game | null>
  gameForm: GameFormState
  settings: AppSettingsState
  isDraftingReview: Ref<boolean>
  reviewDraftPreview: Ref<string>
  playNextRecommendations: Ref<PlayNextRecommendationResponse[]>
  isGeneratingPlayNextRecommendation: Ref<boolean>
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
    isDraftingReview,
    reviewDraftPreview,
    playNextRecommendations,
    isGeneratingPlayNextRecommendation,
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

  async function generatePlayNextRecommendation() {
    ensureSyncConfig()
    isGeneratingPlayNextRecommendation.value = true

    try {
      const response = await requestPlayNextRecommendation(
        settings.syncApiBaseUrl,
        settings.syncToken,
        settings.language,
      )

      playNextRecommendations.value = response.recommendations.map((recommendation) => ({
        slot: recommendation.slot,
        gameId: recommendation.gameId,
        title: recommendation.title.trim(),
        reason: recommendation.reason.trim(),
      }))

      return response
    } catch (error) {
      const message = getSyncErrorMessage(error, translate(settings.language, 'feedback.playNextFailed'))
      setFeedback(message, 'error')
      throw new Error(message)
    } finally {
      isGeneratingPlayNextRecommendation.value = false
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

  return { generateReviewDraft, generatePlayNextRecommendation, applyReviewDraft, discardReviewDraft }
}
