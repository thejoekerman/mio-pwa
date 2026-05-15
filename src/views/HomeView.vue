<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import EmblaCarousel, { type EmblaCarouselType } from 'embla-carousel'
import GameCover from '../components/GameCover.vue'
import HomeChoiceCard from '../components/HomeChoiceCard.vue'
import TrophyIcon from '../components/TrophyIcon.vue'
import { useBacklog } from '../composables/useBacklog'
import { useI18n } from '../i18n'
import { downloadBackupPayload } from '../lib/backupDownload'
import type { Game, GameStatus } from '../types'

const {
  canUsePlayNextRecommendation,
  currentFocus,
  dismissBackupReminder,
  duePausedGames,
  earnedTrophyViews,
  exportBackup,
  formatDate,
  generatePlayNextRecommendation,
  games,
  isGeneratingPlayNextRecommendation,
  logDraft,
  playNextRecommendations,
  recentLogs,
  saveCurrentLog,
  selectGame,
  setFeedback,
  shouldShowBackupReminder,
  snoozePausedGame,
  trophyViews,
  updateGameStatus,
} = useBacklog()
const { statusLabel, t } = useI18n()

const activeGameId = ref<string | null>(null)
const activeSlideIndex = ref(0)
const emblaViewportRef = ref<HTMLElement | null>(null)
const emblaApi = ref<EmblaCarouselType | null>(null)
const randomBacklogGame = ref<Game | null>(null)
const ACTIVE_HOME_STATUSES: GameStatus[] = ['playing', 'ongoing']

const activeHomeGames = computed(() =>
  games.value
    .filter((game) => ACTIVE_HOME_STATUSES.includes(game.status))
    .sort((left, right) => {
      if (left.status === right.status) {
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      }

      return left.status === 'playing' ? -1 : 1
    }),
)

const displayedRecentLogs = computed(() => recentLogs.value.slice(0, 3))
const recentTrophies = computed(() => earnedTrophyViews.value.slice(0, 3))
const gamesById = computed(() => new Map(games.value.map((game) => [game.id, game])))
const randomBacklogCandidates = computed(() =>
  games.value
    .filter((game) => game.deletedAt === null && game.status === 'backlog')
    .sort((left, right) => left.title.localeCompare(right.title)),
)
const enrichedPlayNextRecommendations = computed(() =>
  playNextRecommendations.value.map((recommendation) => ({
    ...recommendation,
    game: gamesById.value.get(recommendation.gameId) ?? null,
  })),
)
const canUseLocalShelfDraw = computed(
  () => !canUsePlayNextRecommendation.value && randomBacklogCandidates.value.length > 0,
)
const canUseAiChoicePanel = computed(
  () =>
    canUsePlayNextRecommendation.value ||
    playNextRecommendations.value.length > 0,
)
const shouldShowChoicePanel = computed(
  () =>
    canUseAiChoicePanel.value ||
    canUseLocalShelfDraw.value,
)

const featuredGame = computed(() => {
  if (activeHomeGames.value.length > 0) {
    return (
      activeHomeGames.value.find((game) => game.id === activeGameId.value) ?? activeHomeGames.value[0]
    )
  }

  return currentFocus.value
})

function syncEmblaToActiveGame() {
  if (!emblaApi.value || activeHomeGames.value.length <= 1 || !activeGameId.value) {
    return
  }

  const nextIndex = activeHomeGames.value.findIndex((game) => game.id === activeGameId.value)

  if (nextIndex < 0) {
    return
  }

  activeSlideIndex.value = nextIndex

  if (emblaApi.value.selectedScrollSnap() !== nextIndex) {
    emblaApi.value.scrollTo(nextIndex, true)
  }
}

watch(
  activeHomeGames,
  (entries) => {
    if (entries.length === 0) {
      activeGameId.value = null
      activeSlideIndex.value = 0
      return
    }

    if (!entries.some((game) => game.id === activeGameId.value)) {
      activeGameId.value = entries[0].id
    }
  },
  { immediate: true },
)

watch(
  emblaApi,
  (api) => {
    if (!api) {
      return
    }

    const syncSelection = () => {
      activeSlideIndex.value = api.selectedScrollSnap()
      const game = activeHomeGames.value[activeSlideIndex.value]

      if (game) {
        activeGameId.value = game.id
      }
    }

    api.on('select', syncSelection)
    api.on('reInit', syncEmblaToActiveGame)
    syncEmblaToActiveGame()
    syncSelection()
  },
  { immediate: true },
)

watch(
  activeGameId,
  (gameId) => {
    if (!gameId || !emblaApi.value || activeHomeGames.value.length <= 1) {
      return
    }

    const nextIndex = activeHomeGames.value.findIndex((game) => game.id === gameId)

    if (nextIndex >= 0 && nextIndex !== emblaApi.value.selectedScrollSnap()) {
      emblaApi.value.scrollTo(nextIndex)
    }
  },
)

watch(
  () => activeHomeGames.value.map((game) => `${game.id}:${game.updatedAt}`).join('|'),
  async () => {
    if (activeHomeGames.value.length <= 1 || !emblaApi.value) {
      return
    }

    await nextTick()
    syncEmblaToActiveGame()
  },
)

watch(
  featuredGame,
  async (game) => {
    if (game) {
      await selectGame(game.id)
    }
  },
  { immediate: true },
)

async function focusPlayingGame(gameId: string) {
  activeGameId.value = gameId
  await selectGame(gameId)
}

function goToHomeGame(index: number) {
  emblaApi.value?.scrollTo(index)
}

function drawRandomBacklogGame() {
  const candidates =
    randomBacklogCandidates.value.length > 1 && randomBacklogGame.value
      ? randomBacklogCandidates.value.filter((game) => game.id !== randomBacklogGame.value?.id)
      : randomBacklogCandidates.value

  if (candidates.length === 0) {
    randomBacklogGame.value = null
    return
  }

  randomBacklogGame.value = candidates[Math.floor(Math.random() * candidates.length)]
}

async function handleBackupExport() {
  const payload = await exportBackup()

  downloadBackupPayload(payload)
  setFeedback(t('feedback.backupExported', { date: payload.exportedAt.slice(0, 10) }))
}

function destroyEmbla() {
  emblaApi.value?.destroy()
  emblaApi.value = null
}

function createEmbla() {
  if (!emblaViewportRef.value) {
    return
  }

  destroyEmbla()

  emblaApi.value = EmblaCarousel(emblaViewportRef.value, {
    align: 'start',
    containScroll: 'trimSnaps',
    dragFree: false,
    loop: false,
  })
}

watch(
  () => activeHomeGames.value.length,
  async (count) => {
    if (count <= 1) {
      destroyEmbla()
      activeSlideIndex.value = 0
      return
    }

    await nextTick()
    createEmbla()
  },
  { immediate: true },
)

watch(
  randomBacklogCandidates,
  (candidates) => {
    if (
      randomBacklogGame.value &&
      !candidates.some((game) => game.id === randomBacklogGame.value?.id)
    ) {
      randomBacklogGame.value = null
    }
  },
)

onBeforeUnmount(() => {
  destroyEmbla()
})
</script>

<template>
  <div class="view-stack home-view">
    <section v-if="shouldShowBackupReminder" class="panel home-backup-reminder">
      <div class="home-backup-reminder-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 3 5 6v5c0 4.4 2.8 8.4 7 10 4.2-1.6 7-5.6 7-10V6l-7-3Z" />
          <path d="M12 8v7" />
          <path d="m9 12 3 3 3-3" />
        </svg>
      </div>
      <div class="home-backup-reminder-copy">
        <p class="section-kicker">{{ t('home.backupReminderKicker') }}</p>
        <h2>{{ t('home.backupReminderTitle') }}</h2>
        <p>{{ t('home.backupReminderBody') }}</p>
      </div>
      <div class="home-backup-reminder-actions">
        <VBtn class="miolog-primary-action" color="primary" type="button" @click="handleBackupExport">
          {{ t('home.exportBackup') }}
        </VBtn>
        <VBtn variant="outlined" color="primary" type="button" @click="dismissBackupReminder">
          {{ t('home.backupReminderLater') }}
        </VBtn>
      </div>
    </section>

    <main v-if="featuredGame || shouldShowChoicePanel" class="home-stack">
      <section v-if="featuredGame" class="panel home-capture-panel">
        <div class="home-capture-header">
          <div
            class="home-capture-title-row"
            :class="{ 'home-capture-title-row--with-cover': activeHomeGames.length <= 1 }"
          >
            <GameCover
              v-if="activeHomeGames.length <= 1"
              :title="featuredGame.title"
              :cover-url="featuredGame.coverUrl"
              size="small"
            />
            <div>
              <p class="section-kicker">{{ t('home.nowPlaying') }}</p>
              <h1 v-if="activeHomeGames.length <= 1" class="view-title home-capture-title">
                {{ featuredGame.title }}
              </h1>
              <div v-if="activeHomeGames.length <= 1" class="home-capture-meta">
                <span class="focus-chip">{{ featuredGame.platform || t('home.platformFree') }}</span>
                <span class="detail-status">{{ statusLabel(featuredGame.status) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="activeHomeGames.length > 1" class="home-now-playing-strip">
          <div class="section-heading compact">
            <div>
              <h2>{{ t('home.activeGames') }}</h2>
            </div>
          </div>

          <div class="home-playing-rail embla">
            <div ref="emblaViewportRef" class="embla__viewport" :aria-label="t('home.activeGamesAria')">
              <div class="embla__container">
                <div v-for="game in activeHomeGames" :key="game.id" class="embla__slide">
                  <button
                    type="button"
                    class="playing-rail-card"
                    :class="{ active: featuredGame.id === game.id }"
                  @click="focusPlayingGame(game.id)"
                >
                  <GameCover :title="game.title" :cover-url="game.coverUrl" size="small" />
                  <span class="playing-rail-card-copy">
                    <strong>{{ game.title }}</strong>
                    <span>{{ game.platform || t('home.platformFree') }}</span>
                  </span>
                </button>
              </div>
            </div>
            </div>
          </div>

          <div class="home-rail-dots" :aria-label="t('home.paginationAria')">
            <button
              v-for="(game, index) in activeHomeGames"
              :key="`dot-${game.id}`"
              type="button"
              class="home-rail-dot"
              :class="{ active: activeSlideIndex === index }"
              :aria-label="t('home.goToGame', { title: game.title })"
              @click="goToHomeGame(index)"
            />
          </div>
        </div>

        <div class="home-current-actions">
          <RouterLink
            class="icon-button large"
            :aria-label="t('home.openFullGamePage')"
            :title="t('home.openFullGamePage')"
            :to="{ name: 'game', params: { gameId: featuredGame.id } }"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M15 3h6v6" />
              <path d="M10 14 21 3" />
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            </svg>
          </RouterLink>
          <RouterLink
            class="icon-button large"
            :aria-label="t('home.editThisGame')"
            :title="t('home.editThisGame')"
            :to="{ name: 'edit-game', params: { gameId: featuredGame.id } }"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </RouterLink>
        </div>

        <form class="home-quick-form" @submit.prevent="saveCurrentLog">
          <VTextarea
            class="form-control"
            :model-value="logDraft"
            rows="4"
            :aria-label="t('home.quickPlayLog')"
            :placeholder="t('home.quickPlayLogPlaceholder')"
            @update:model-value="logDraft = $event"
          />

          <div class="home-quick-actions home-quick-actions--submit">
            <VBtn class="miolog-primary-action" color="primary" type="submit">
              {{ t('home.addPlayLog') }}
            </VBtn>
          </div>
        </form>
      </section>

      <section class="home-grid">
        <section v-if="!featuredGame" class="panel home-empty-panel">
          <div class="empty-state compact">
            <h3>{{ t('home.noCurrentGame') }}</h3>
            <p>{{ t('home.noCurrentGameBody') }}</p>
          </div>
        </section>

        <section
          v-if="duePausedGames.length > 0"
          class="panel home-side-panel home-paused-panel"
        >
          <div class="section-heading compact">
            <div>
              <p class="section-kicker">{{ t('home.pausedNudges') }}</p>
              <h2>{{ t('home.pausedNotForgotten') }}</h2>
            </div>
          </div>

          <div class="home-paused-list">
            <article v-for="game in duePausedGames" :key="game.id" class="home-paused-card">
              <GameCover :title="game.title" :cover-url="game.coverUrl" size="small" />
              <div class="home-paused-copy">
                <h3>{{ game.title }}</h3>
                <p>
                  {{
                    game.nudgeAt
                      ? t('home.pausedDue', { date: game.nudgeAt })
                      : t('home.pausedDueNoDate')
                  }}
                </p>
                <div class="home-paused-actions">
                  <button
                    class="icon-button"
                    type="button"
                    :aria-label="t('home.resumePausedGame')"
                    :title="t('home.resumePausedGame')"
                    @click="updateGameStatus(game, 'playing')"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                      <polygon points="8 5 19 12 8 19 8 5" />
                    </svg>
                  </button>
                  <button
                    class="icon-button"
                    type="button"
                    :aria-label="t('home.snoozePausedGame')"
                    :title="t('home.snoozePausedGame')"
                    @click="snoozePausedGame(game, 7)"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                  </button>
                  <RouterLink
                    class="icon-button"
                    :aria-label="t('home.openFullGamePage')"
                    :title="t('home.openFullGamePage')"
                    :to="{ name: 'game', params: { gameId: game.id } }"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                      <path d="M15 3h6v6" />
                      <path d="M10 14 21 3" />
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    </svg>
                  </RouterLink>
                </div>
              </div>
            </article>
          </div>
        </section>

        <aside v-if="featuredGame" class="panel home-side-panel">
          <div class="section-heading">
            <div>
              <p class="section-kicker">{{ t('home.recentMoments') }}</p>
              <h2>{{ t('home.whatJustHappened') }}</h2>
            </div>
          </div>

          <div v-if="displayedRecentLogs.length > 0" class="home-log-preview">
            <article v-for="log in displayedRecentLogs" :key="log.id" class="log-entry compact">
              <time>{{ formatDate(log.createdAt) }}</time>
              <p>{{ log.content }}</p>
            </article>
            <div class="home-current-actions">
              <RouterLink
                class="icon-button large"
                :aria-label="t('home.openFullGamePage')"
                :title="t('home.openFullGamePage')"
                :to="{ name: 'game', params: { gameId: featuredGame.id } }"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M15 3h6v6" />
                  <path d="M10 14 21 3" />
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                </svg>
              </RouterLink>
            </div>
          </div>
          <div v-else class="empty-state compact">
            <h3>{{ t('home.noRecentThoughts') }}</h3>
            <p>{{ t('home.noRecentThoughtsBody') }}</p>
          </div>
        </aside>

        <section
          v-if="shouldShowChoicePanel"
          class="panel home-side-panel"
        >
          <div class="home-ai-card">
            <div class="home-ai-card-header">
              <div>
                <p class="section-kicker">{{ t('home.mioChoice') }}</p>
                <h3>{{ t('home.whatToPlayNext') }}</h3>
              </div>
            </div>

            <div class="home-ai-task-list">
              <article
                v-if="canUsePlayNextRecommendation || enrichedPlayNextRecommendations.length > 0"
                class="home-ai-task-card"
              >
                <div class="home-ai-task-header">
                  <div>
                    <p class="section-kicker">{{ t('home.backlogPickKicker') }}</p>
                    <h4>{{ t('home.backlogPickTitle') }}</h4>
                    <p class="soft-meta">{{ t('home.backlogPickBody') }}</p>
                  </div>
                  <button
                    v-if="canUsePlayNextRecommendation"
                    class="icon-button large"
                    type="button"
                    :disabled="isGeneratingPlayNextRecommendation"
                    :aria-label="
                      enrichedPlayNextRecommendations.length > 0
                        ? t('home.refreshPlayNext')
                        : t('home.askPlayNext')
                    "
                    :title="
                      enrichedPlayNextRecommendations.length > 0
                        ? t('home.refreshPlayNext')
                        : t('home.askPlayNext')
                    "
                    @click="generatePlayNextRecommendation"
                  >
                    <span
                      v-if="isGeneratingPlayNextRecommendation"
                      class="button-spinner"
                      aria-hidden="true"
                    />
                    <svg v-else class="shelf-pick-icon" aria-hidden="true" viewBox="0 0 24 24">
                      <rect x="4" y="4.85" width="12.25" height="2.26" rx="0.6" />
                      <rect x="4" y="8.86" width="12.25" height="2.26" rx="0.6" />
                      <rect x="7.76" y="12.87" width="12.25" height="2.26" rx="0.6" />
                      <rect x="4" y="16.88" width="12.25" height="2.26" rx="0.6" />
                    </svg>
                  </button>
                </div>

                <div v-if="enrichedPlayNextRecommendations.length > 0" class="home-ai-list">
                  <HomeChoiceCard
                    v-for="recommendation in enrichedPlayNextRecommendations"
                    :key="`${recommendation.slot}-${recommendation.gameId}`"
                    :kicker="
                      recommendation.slot === 'continue'
                        ? t('home.continueThread')
                        : t('home.takeABreather')
                    "
                    :title="recommendation.title"
                    :cover-url="recommendation.game?.coverUrl"
                    :meta="recommendation.game ? recommendation.game.platform || t('home.platformFree') : null"
                    :body="recommendation.reason"
                    :game-id="recommendation.gameId"
                    :link-label="t('home.openRecommendedGame')"
                  />
                </div>
                <p v-else class="soft-meta">{{ t('home.noPlayNextYetBody') }}</p>
              </article>

              <article v-if="canUseLocalShelfDraw" class="home-ai-task-card">
                <div class="home-ai-task-header">
                  <div>
                    <p class="section-kicker">{{ t('home.shelfDrawKicker') }}</p>
                    <h4>{{ t('home.shelfDrawTitle') }}</h4>
                    <p class="soft-meta">{{ t('home.shelfDrawBody') }}</p>
                  </div>
                  <button
                    class="icon-button large"
                    type="button"
                    :aria-label="randomBacklogGame ? t('home.drawAgain') : t('home.drawBacklogGame')"
                    :title="randomBacklogGame ? t('home.drawAgain') : t('home.drawBacklogGame')"
                    @click="drawRandomBacklogGame"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                      <rect x="5" y="5" width="14" height="14" rx="3" />
                      <path d="M9 9h.01" />
                      <path d="M15 9h.01" />
                      <path d="M12 12h.01" />
                      <path d="M9 15h.01" />
                      <path d="M15 15h.01" />
                    </svg>
                  </button>
                </div>

                <div class="home-ai-list">
                  <HomeChoiceCard
                    v-if="randomBacklogGame"
                    :kicker="t('home.drawnFromBacklog')"
                    :title="randomBacklogGame.title"
                    :cover-url="randomBacklogGame.coverUrl"
                    :meta="randomBacklogGame.platform || t('home.platformFree')"
                    :game-id="randomBacklogGame.id"
                    :link-label="t('home.openDrawnGame')"
                  />
                </div>
              </article>
            </div>
          </div>
        </section>

        <section
          v-if="earnedTrophyViews.length > 0"
          class="panel home-side-panel home-trophy-panel"
        >
          <div class="section-heading">
            <div>
              <p class="section-kicker">{{ t('trophies.panelKicker') }}</p>
              <h2>{{ t('trophies.panelTitle') }}</h2>
              <p class="soft-meta">
                {{
                  t('trophies.panelBody', {
                    earned: earnedTrophyViews.length,
                    total: trophyViews.length,
                  })
                }}
              </p>
            </div>
          </div>

          <div class="home-trophy-list">
            <article v-for="trophy in recentTrophies" :key="trophy.id" class="home-trophy-card">
              <TrophyIcon :icon-key="trophy.iconKey" earned />
              <div>
                <h3>{{ t(trophy.titleKey) }}</h3>
                <p>{{ t(trophy.descriptionKey) }}</p>
              </div>
            </article>
            <div class="home-current-actions">
              <RouterLink
                class="icon-button large"
                :aria-label="t('trophies.openCabinet')"
                :title="t('trophies.openCabinet')"
                :to="{ name: 'trophies' }"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M15 3h6v6" />
                  <path d="M10 14 21 3" />
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                </svg>
              </RouterLink>
            </div>
          </div>
        </section>
      </section>
    </main>

    <section v-else class="panel home-empty-panel">
      <div class="empty-state compact">
        <h3>{{ t('home.noCurrentGame') }}</h3>
        <p>{{ t('home.noCurrentGameBody') }}</p>
      </div>
    </section>
  </div>
</template>
