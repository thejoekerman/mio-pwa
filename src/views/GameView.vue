<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import GameDetailPanel from '../components/GameDetailPanel.vue'
import { useBacklog } from '../composables/useBacklog'
import { useI18n } from '../i18n'

const route = useRoute()
const { t } = useI18n()
const {
  addSelectedJourneyPlayTime,
  applyReviewDraft,
  canStartReplay,
  canUseReviewDraft,
  discardReviewDraft,
  formatDate,
  generateReviewDraft,
  games,
  isDraftingReview,
  journeyLogs,
  localReviewProgress,
  logDraft,
  logs,
  reviewDraftPreview,
  removeJourney,
  saveCurrentLog,
  selectGame,
  selectJourney,
  selectedGame,
  selectedGameJourneys,
  selectedJourney,
  selectedJourneyDisplayStatus,
  selectedJourneyGame,
  selectedJourneyId,
  setFeedback,
  startReplay,
  updateLogEntry,
  updateSelectedJourneyStatus,
} =
  useBacklog()

const routeGameId = computed(() => String(route.params.gameId ?? ''))

watch(
  [routeGameId, games],
  async ([gameId]) => {
    if (gameId) {
      await selectGame(gameId)
    }
  },
  { immediate: true },
)

const gameExists = computed(() => games.value.some((game) => game.id === routeGameId.value))
const selectedGameJourneyIds = computed(() =>
  new Set(selectedGameJourneys.value.map((journey) => journey.id)),
)
const selectedGameJourneyLogs = computed(() =>
  journeyLogs.value.filter((log) => selectedGameJourneyIds.value.has(log.journeyId)),
)
const deleteJourneyDialogOpen = ref(false)

async function confirmDeleteJourney() {
  const journey = selectedJourney.value
  deleteJourneyDialogOpen.value = false

  if (journey) {
    await removeJourney(journey)
  }
}

function handleReviewCopied() {
  setFeedback(t('feedback.reviewCopied'))
}

function handleReviewCopyFailed() {
  setFeedback(t('feedback.reviewCopyFailed'), 'error')
}

function handleJournalCopied() {
  setFeedback(t('feedback.journalCopied'))
}

function handleJournalCopyFailed() {
  setFeedback(t('feedback.journalCopyFailed'), 'error')
}

function handleJournalExported() {
  setFeedback(t('feedback.journalExported'))
}

function handlePlayLogShared() {
  setFeedback(t('feedback.playLogShared'))
}

function handlePlayLogCopied() {
  setFeedback(t('feedback.playLogCopied'))
}

function handlePlayLogShareFailed() {
  setFeedback(t('feedback.playLogShareFailed'), 'error')
}
</script>

<template>
  <div class="view-stack">
    <GameDetailPanel
      v-if="selectedGame"
      :add-play-time="addSelectedJourneyPlayTime"
      :can-use-review-draft="canUseReviewDraft"
      :can-start-replay="canStartReplay"
      :format-date="formatDate"
      :is-drafting-review="isDraftingReview"
      :draft-status="localReviewProgress"
      :change-game-status="updateSelectedJourneyStatus"
      :log-draft="logDraft"
      :logs="logs"
      :review-draft-preview="reviewDraftPreview"
      :selected-game="selectedJourneyGame"
      :selected-journey="selectedJourney"
      :selected-journey-id="selectedJourneyId"
      :journeys="selectedGameJourneys"
      :journey-logs="selectedGameJourneyLogs"
      :selected-game-display-status="selectedJourneyDisplayStatus"
      @apply-review-draft="applyReviewDraft"
      @discard-review-draft="discardReviewDraft"
      @delete-journey="deleteJourneyDialogOpen = true"
      @draft-review="generateReviewDraft"
      @review-copied="handleReviewCopied"
      @review-copy-failed="handleReviewCopyFailed"
      @journal-copied="handleJournalCopied"
      @journal-copy-failed="handleJournalCopyFailed"
      @journal-exported="handleJournalExported"
      @play-log-shared="handlePlayLogShared"
      @play-log-copied="handlePlayLogCopied"
      @play-log-share-failed="handlePlayLogShareFailed"
      @save-log="saveCurrentLog"
      @save-log-edit="updateLogEntry"
      @select-journey="selectJourney"
      @start-replay="startReplay(selectedGame)"
      @update-log-draft="logDraft = $event"
    />

    <section v-else class="panel">
      <div class="empty-state compact">
        <h3>{{ gameExists ? t('gameView.loadingGame') : t('gameView.gameNotFound') }}</h3>
        <p>
          {{
            gameExists
              ? t('gameView.detailsOnWay')
              : t('gameView.gameMissing')
          }}
        </p>
      </div>
    </section>

    <VDialog v-model="deleteJourneyDialogOpen" class="confirm-dialog" max-width="420">
      <VCard>
        <VCardTitle>{{ t('detail.deleteJourney') }}</VCardTitle>
        <VCardText>{{ t('detail.confirmDeleteJourney') }}</VCardText>
        <VCardActions>
          <VBtn type="button" variant="outlined" color="primary" @click="deleteJourneyDialogOpen = false">
            {{ t('form.cancelDelete') }}
          </VBtn>
          <VBtn type="button" color="error" variant="flat" @click="confirmDeleteJourney">
            {{ t('detail.deleteJourney') }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>
