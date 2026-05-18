<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import GameCover from './GameCover.vue'
import { useI18n } from '../i18n'
import {
  createGameJournalFileName,
  createGameJournalMarkdown,
  downloadMarkdownFile,
} from '../lib/journalExport'
import { getDisplayDeveloper, getDisplayPublisher } from '../lib/gameMetadata'
import { getTimeToBeatHours } from '../lib/timeToBeat'
import { GAME_STATUSES, type Game, type GameStatus, type LogEntry } from '../types'

const { ownershipLabel, statusLabel, t } = useI18n()
const router = useRouter()

const props = defineProps<{
  canUseReviewDraft: boolean
  formatDate: (value: string) => string
  isDraftingReview: boolean
  logDraft: string
  logs: LogEntry[]
  reviewDraftPreview: string
  selectedGame: Game | null
  changeGameStatus: (game: Game, status: GameStatus) => void | Promise<void>
}>()

const emit = defineEmits<{
  applyReviewDraft: []
  discardReviewDraft: []
  draftReview: []
  journalCopied: []
  journalCopyFailed: []
  journalExported: []
  saveLog: []
  saveLogEdit: [logId: string, content: string]
  updateLogDraft: [value: string]
}>()

const editingLogId = ref<string | null>(null)
const editingLogContent = ref('')
const trimmedEditingLogContent = computed(() => editingLogContent.value.trim())
const editingLog = computed(() => props.logs.find((log) => log.id === editingLogId.value) ?? null)
const canSaveEditingLog = computed(
  () => Boolean(editingLog.value) &&
    trimmedEditingLogContent.value.length > 0 &&
    trimmedEditingLogContent.value !== editingLog.value?.content,
)
const canShareJournal = computed(() =>
  Boolean(props.selectedGame && (props.logs.length > 0 || props.selectedGame.review.trim())),
)
const journalMarkdown = computed(() => {
  if (!props.selectedGame) {
    return ''
  }

  return createGameJournalMarkdown({
    formatDate: props.formatDate,
    game: props.selectedGame,
    labels: {
      finished: t('detail.finished'),
      format: t('detail.ownershipType'),
      noLogs: t('detail.noLogs'),
      overview: t('detail.kicker'),
      platform: t('detail.platform'),
      playLogs: t('detail.sessionNotes'),
      playTime: t('detail.playTime'),
      rating: t('detail.rating'),
      review: t('detail.review'),
      status: t('detail.currentStatus'),
      tags: t('detail.tags'),
    },
    logs: props.logs,
    ownershipLabel: props.selectedGame.ownershipType
      ? ownershipLabel(props.selectedGame.ownershipType)
      : null,
    statusLabel: statusLabel(props.selectedGame.status),
  })
})
const detailMetadata = computed(() => {
  if (!props.selectedGame) {
    return []
  }

  const game = props.selectedGame

  return [
    game.platform || t('detail.anywhere'),
    game.ownershipType ? ownershipLabel(game.ownershipType) : null,
    game.rating !== null ? `${game.rating}/10` : null,
    game.playTimeHours !== null ? `${game.playTimeHours} h` : null,
    game.releaseYear ? String(game.releaseYear) : null,
    formatTimeToBeat(game) ? `${formatTimeToBeat(game)} TTB` : null,
    igdbCreditLine(game),
    ...game.tags,
  ].filter((item): item is string => Boolean(item))
})

watch(
  () => props.logs.map((log) => log.id).join('|'),
  () => {
    if (editingLogId.value && !props.logs.some((log) => log.id === editingLogId.value)) {
      cancelEditingLog()
    }
  },
)

function handleKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    emit('saveLog')
  }
}

function handleEditKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    saveEditingLog()
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    cancelEditingLog()
  }
}

function goBack() {
  if (window.history.length > 1) {
    router.back()
    return
  }

  void router.push({ name: 'library' })
}

function startEditingLog(log: LogEntry) {
  editingLogId.value = log.id
  editingLogContent.value = log.content
}

function cancelEditingLog() {
  editingLogId.value = null
  editingLogContent.value = ''
}

function saveEditingLog() {
  if (!editingLogId.value || !canSaveEditingLog.value) {
    return
  }

  emit('saveLogEdit', editingLogId.value, trimmedEditingLogContent.value)
  cancelEditingLog()
}

async function copyJournal() {
  if (!canShareJournal.value || !navigator.clipboard) {
    emit('journalCopyFailed')
    return
  }

  try {
    await navigator.clipboard.writeText(journalMarkdown.value)
    emit('journalCopied')
  } catch {
    emit('journalCopyFailed')
  }
}

function exportJournal() {
  if (!props.selectedGame || !canShareJournal.value) {
    return
  }

  downloadMarkdownFile(createGameJournalFileName(props.selectedGame), journalMarkdown.value)
  emit('journalExported')
}

function wasEdited(log: LogEntry) {
  return new Date(log.updatedAt).getTime() > new Date(log.createdAt).getTime()
}

function formatTimeToBeat(game: Game) {
  const hours = getTimeToBeatHours(game)

  return hours === null ? null : `~${hours} h`
}

async function handleStatusChange(game: Game, status: GameStatus) {
  await props.changeGameStatus(game, status)
}

function igdbCreditLine(game: Game) {
  const developers = getDisplayDeveloper(game)
  const publishers = getDisplayPublisher(game)

  if (developers && publishers) {
    return t('detail.igdbCreditsFull', { developers, publishers })
  }

  if (developers) {
    return t('detail.igdbCreditsDevelopers', { developers })
  }

  if (publishers) {
    return t('detail.igdbCreditsPublishers', { publishers })
  }

  return null
}
</script>

<template>
  <section class="panel detail-panel">
    <div v-if="selectedGame" class="detail-content">
      <button
        type="button"
        class="icon-button detail-back-button"
        :aria-label="t('detail.goBack')"
        :title="t('detail.goBack')"
        @click="goBack"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>

      <div class="section-heading">
        <div>
          <p class="section-kicker">{{ t('detail.kicker') }}</p>
        </div>
      </div>

      <div class="detail-hero">
        <div class="detail-cover-rail">
          <GameCover :title="selectedGame.title" :cover-url="selectedGame.coverUrl" size="large" />
          <RouterLink
            class="icon-button large"
            :aria-label="t('library.editDetails')"
            :title="t('library.editDetails')"
            replace
            :to="{ name: 'edit-game', params: { gameId: selectedGame.id } }"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </RouterLink>
        </div>
        <div class="detail-hero-copy">
          <h2>{{ selectedGame.title }}</h2>
          <div class="detail-hero-control-row">
          <VMenu location="bottom start">
            <template #activator="{ props: activatorProps }">
              <button
                v-bind="activatorProps"
                type="button"
                class="status-pill detail-status-pill"
              >
                {{ statusLabel(selectedGame.status) }}
              </button>
            </template>

            <VList class="status-menu-list" density="compact">
              <VListItem
                v-for="status in GAME_STATUSES"
                :key="status"
                :active="selectedGame.status === status"
                :title="statusLabel(status)"
                @click="handleStatusChange(selectedGame, status)"
              />
            </VList>
          </VMenu>
            <div class="card-metadata-list detail-hero-metadata">
              <template v-for="(item, index) in detailMetadata" :key="`${item}-${index}`">
                <span>{{ item }}</span>
                <span v-if="index < detailMetadata.length - 1" class="metadata-separator" aria-hidden="true">&nbsp;· </span>
              </template>
            </div>
          </div>
          <a
            v-if="selectedGame.igdbUrl"
            class="detail-meta-link"
            :href="selectedGame.igdbUrl"
            target="_blank"
            rel="noreferrer"
          >
            {{ t('detail.openIgdb') }}
          </a>
        </div>
      </div>

      <div v-if="selectedGame.review || canUseReviewDraft || reviewDraftPreview" class="detail-notes">
        <div class="detail-notes-header">
          <p class="section-kicker">{{ t('detail.review') }}</p>
          <VBtn
            v-if="canUseReviewDraft"
            type="button"
            variant="outlined"
            color="primary"
            :disabled="isDraftingReview"
            :loading="isDraftingReview"
            @click="emit('draftReview')"
          >
            {{
              isDraftingReview
                ? t('detail.draftingReview')
                : selectedGame.review
                  ? t('detail.redraftFromLogs')
                  : t('detail.draftFromLogs')
            }}
          </VBtn>
        </div>

        <p v-if="selectedGame.review">{{ selectedGame.review }}</p>
        <p v-else class="detail-empty-copy">{{ t('detail.noReviewYet') }}</p>
      </div>

      <div v-if="reviewDraftPreview" class="detail-notes detail-notes--draft">
        <div class="detail-notes-header">
          <p class="section-kicker">{{ t('detail.reviewDraft') }}</p>
        </div>
        <p>{{ reviewDraftPreview }}</p>
        <div class="home-quick-actions">
          <VBtn
            class="miolog-primary-action"
            color="primary"
            type="button"
            @click="emit('applyReviewDraft')"
          >
            {{ t('detail.useAsReview') }}
          </VBtn>
          <VBtn type="button" variant="outlined" color="primary" @click="emit('discardReviewDraft')">
            {{ t('detail.discardDraft') }}
          </VBtn>
        </div>
      </div>

      <div class="detail-log-zone">
        <div class="section-heading compact detail-log-header">
          <div class="detail-log-title">
            <p class="section-kicker">{{ t('detail.sessionNotes') }}</p>
            <span class="detail-log-count">{{ logs.length }}</span>
          </div>
          <div class="detail-log-actions">
            <button
              class="icon-button"
              type="button"
              :disabled="!canShareJournal"
              :aria-label="t('detail.copyJournal')"
              :title="t('detail.copyJournal')"
              @click="copyJournal"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <rect width="14" height="14" x="8" y="8" rx="2" />
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
              </svg>
            </button>
            <button
              class="icon-button"
              type="button"
              :disabled="!canShareJournal"
              :aria-label="t('detail.exportJournal')"
              :title="t('detail.exportJournal')"
              @click="exportJournal"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="M7 10l5 5 5-5" />
                <path d="M12 15V3" />
              </svg>
            </button>
          </div>
        </div>

        <form class="log-form" @submit.prevent="emit('saveLog')">
          <VTextarea
            class="form-control"
            :model-value="logDraft"
            rows="3"
            :aria-label="t('detail.quickThought')"
            :placeholder="t('detail.quickThoughtPlaceholder')"
            @keydown="handleKeydown"
            @update:model-value="emit('updateLogDraft', $event)"
          />
          <VBtn class="miolog-primary-action" color="primary" type="submit">
            {{ t('detail.addLogEntry') }}
          </VBtn>
        </form>

        <div v-if="logs.length > 0" class="log-list">
          <article v-for="log in logs" :key="log.id" class="log-entry">
            <div class="log-entry-header">
              <div class="log-entry-meta">
                <time>{{ formatDate(log.createdAt) }}</time>
                <span v-if="wasEdited(log)" class="log-entry-edited">
                  {{ t('detail.editedLog', { date: formatDate(log.updatedAt) }) }}
                </span>
              </div>
              <button
                v-if="editingLogId !== log.id"
                class="icon-button log-edit-button"
                type="button"
                :aria-label="t('detail.editLog')"
                :title="t('detail.editLog')"
                @click="startEditingLog(log)"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            </div>

            <form v-if="editingLogId === log.id" class="log-edit-form" @submit.prevent="saveEditingLog">
              <VTextarea
                class="form-control"
                :model-value="editingLogContent"
                rows="4"
                auto-grow
                :aria-label="t('detail.editLog')"
                @keydown="handleEditKeydown"
                @update:model-value="editingLogContent = String($event ?? '')"
              />
              <div class="log-edit-actions">
                <VBtn
                  class="miolog-primary-action"
                  color="primary"
                  type="submit"
                  :disabled="!canSaveEditingLog"
                >
                  {{ t('detail.saveLogEdit') }}
                </VBtn>
                <VBtn type="button" variant="outlined" color="primary" @click="cancelEditingLog">
                  {{ t('detail.cancelLogEdit') }}
                </VBtn>
              </div>
            </form>

            <p v-else>{{ log.content }}</p>
          </article>
        </div>

        <div v-else class="empty-state compact">
          <h3>{{ t('detail.noLogs') }}</h3>
          <p>{{ t('detail.noLogsBody') }}</p>
        </div>
      </div>

      <div class="detail-meta">
        <span>{{ t('detail.created', { date: formatDate(selectedGame.createdAt) }) }}</span>
        <span>{{ t('detail.lastUpdated', { date: formatDate(selectedGame.updatedAt) }) }}</span>
      </div>
    </div>

    <div v-else class="empty-state">
      <h3>{{ t('detail.selectGame') }}</h3>
      <p>{{ t('detail.selectGameBody') }}</p>
    </div>
  </section>
</template>
