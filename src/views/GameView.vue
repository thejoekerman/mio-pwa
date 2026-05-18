<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import GameDetailPanel from '../components/GameDetailPanel.vue'
import { useBacklog } from '../composables/useBacklog'
import { useI18n } from '../i18n'

const route = useRoute()
const { t } = useI18n()
const {
  applyReviewDraft,
  canUseReviewDraft,
  discardReviewDraft,
  formatDate,
  generateReviewDraft,
  games,
  isDraftingReview,
  logDraft,
  logs,
  reviewDraftPreview,
  saveCurrentLog,
  selectGame,
  selectedGame,
  setFeedback,
  updateLogEntry,
  updateGameStatus,
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

function handleJournalCopied() {
  setFeedback(t('feedback.journalCopied'))
}

function handleJournalCopyFailed() {
  setFeedback(t('feedback.journalCopyFailed'), 'error')
}

function handleJournalExported() {
  setFeedback(t('feedback.journalExported'))
}
</script>

<template>
  <div class="view-stack">
    <GameDetailPanel
      v-if="selectedGame"
      :can-use-review-draft="canUseReviewDraft"
      :format-date="formatDate"
      :is-drafting-review="isDraftingReview"
      :change-game-status="updateGameStatus"
      :log-draft="logDraft"
      :logs="logs"
      :review-draft-preview="reviewDraftPreview"
      :selected-game="selectedGame"
      @apply-review-draft="applyReviewDraft"
      @discard-review-draft="discardReviewDraft"
      @draft-review="generateReviewDraft"
      @journal-copied="handleJournalCopied"
      @journal-copy-failed="handleJournalCopyFailed"
      @journal-exported="handleJournalExported"
      @save-log="saveCurrentLog"
      @save-log-edit="updateLogEntry"
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
  </div>
</template>
