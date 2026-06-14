<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import EmblaCarousel, { type EmblaCarouselType } from 'embla-carousel'
import { useRouter } from 'vue-router'
import GameCover from '../components/GameCover.vue'
import HomeChoiceCard from '../components/HomeChoiceCard.vue'
import HomeEmptyState from '../components/HomeEmptyState.vue'
import IconExternalLink from '../components/IconExternalLink.vue'
import TrophyIcon from '../components/TrophyIcon.vue'
import { useBacklog } from '../composables/useBacklog'
import { useI18n, type MessageKey } from '../i18n'
import { downloadBackupPayload } from '../lib/backupDownload'
import {
  recommendBacklogGames,
  type BacklogRecommendation,
  type RecommendationReason,
} from '../lib/backlogRecommendation'
import type { Game, GameStatus } from '../types'

const {
  currentFocus,
  dismissBackupReminder,
  duePausedGames,
  earnedTrophyViews,
  exportBackup,
  finishedYearOptions,
  finishedJourneyEntries,
  formatDate,
  games,
  journeys,
  logDraft,
  logs,
  recentLogs,
  saveCurrentLog,
  selectGame,
  setFeedback,
  shouldShowBackupReminder,
  snoozePausedGame,
  trophyViews,
  updateCurrentJourneyStatus,
} = useBacklog()
const { ownershipLabel, t } = useI18n()
const router = useRouter()

const activeGameId = ref<string | null>(null)
const emblaViewportRef = ref<HTMLElement | null>(null)
const emblaApi = ref<EmblaCarouselType | null>(null)
const isDesktopHomeLayout = ref(false)
const pointerDownPosition = ref<{ x: number; y: number } | null>(null)
const backlogRecommendations = ref<BacklogRecommendation[]>([])
const recentRecommendationIds = ref<string[]>([])
const ACTIVE_HOME_STATUSES: GameStatus[] = ['playing', 'ongoing']
let desktopHomeMediaQuery: MediaQueryList | null = null

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

const displayedRecentLogs = computed(() => recentLogs.value.slice(0, isDesktopHomeLayout.value ? 5 : 3))
const recentTrophies = computed(() => earnedTrophyViews.value.slice(0, 3))
const currentGameTimeline = computed(() => {
  if (!featuredGame.value) {
    return []
  }

  const entries = [
    { label: t('home.timelineLogs'), value: t('home.timelineLogCount', { count: logs.value.length }) },
  ]
  const oldestLog = logs.value[logs.value.length - 1] ?? null
  const latestLog = logs.value[0] ?? null

  if (oldestLog) {
    entries.push({ label: t('home.timelineFirstNote'), value: formatDate(oldestLog.createdAt) })
  }

  if (latestLog && latestLog.id !== oldestLog?.id) {
    entries.push({ label: t('home.timelineLatestNote'), value: formatDate(latestLog.createdAt) })
  }

  if (featuredGame.value.playTimeHours !== null) {
    entries.push({ label: t('detail.playTime'), value: `${featuredGame.value.playTimeHours} h` })
  }

  if (featuredGame.value.finishedAt) {
    entries.push({ label: t('detail.finished'), value: featuredGame.value.finishedAt })
  }

  entries.push({
    label: t('detail.review'),
    value: featuredGame.value.review.trim() ? t('home.timelineReviewWritten') : t('home.timelineReviewOpen'),
  })

  return entries
})
const backlogRecommendationCandidates = computed(() =>
  games.value
    .filter((game) => game.deletedAt === null && game.status === 'backlog')
    .sort((left, right) => left.title.localeCompare(right.title)),
)
const canUseLocalRecommendation = computed(() => backlogRecommendationCandidates.value.length > 0)

const activeSlideIndex = computed(() => {
  if (activeHomeGames.value.length === 0 || !activeGameId.value) {
    return 0
  }

  return activeHomeGames.value.findIndex((game) => game.id === activeGameId.value)
})

const featuredGame = computed(() => {
  if (activeHomeGames.value.length > 0) {
    return (
      activeHomeGames.value.find((game) => game.id === activeGameId.value) ?? activeHomeGames.value[0]
    )
  }

  return currentFocus.value
})

const featuredGameMetadata = computed(() => {
  if (!featuredGame.value) {
    return []
  }

  const game = featuredGame.value
  const metadata = [game.platform || t('detail.anywhere')]

  if (game.ownershipType) {
    metadata.push(ownershipLabel(game.ownershipType))
  }

  if (game.rating !== null) {
    metadata.push(`${game.rating}/10`)
  }

  if (game.playTimeHours !== null) {
    metadata.push(`${game.playTimeHours} h`)
  }

  return metadata
})

/**
 * Initialize activeGameId when activeHomeGames becomes available.
 * One-time initialization; activeGameId is then driven by user interaction and activeSlideIndex watcher.
 */
watch(
  () => activeHomeGames.value.length,
  (count) => {
    if (count === 0) {
      activeGameId.value = null
      return
    }

    if (!activeGameId.value || !activeHomeGames.value.some((g) => g.id === activeGameId.value)) {
      activeGameId.value = activeHomeGames.value[0].id
    }
  },
  { immediate: true },
)

/**
 * One-way embla driver: when activeSlideIndex (computed from activeGameId) changes,
 * scroll embla to match. This is the single source of truth for keeping embla in sync.
 */
watch(
  activeSlideIndex,
  (nextIndex) => {
    if (!emblaApi.value || activeHomeGames.value.length <= 1 || nextIndex < 0) {
      return
    }

    if (emblaApi.value.selectedScrollSnap() !== nextIndex) {
      emblaApi.value.scrollTo(nextIndex, true)
    }
  },
)

/**
 * Set up embla event listeners. When embla's selected snap changes (user drag/click),
 * update activeGameId to match the new slide.
 */
watch(
  emblaApi,
  (api) => {
    if (!api) {
      return
    }

    const syncActiveGameFromEmbla = () => {
      const index = api.selectedScrollSnap()
      const game = activeHomeGames.value[index]

      if (game) {
        activeGameId.value = game.id
      }
    }

    // Listen for embla selection changes (user scrolling)
    api.on('select', syncActiveGameFromEmbla)
    // After reInit, restore embla to the current activeGameId position
    api.on('reInit', () => {
      const index = activeSlideIndex.value
      if (index >= 0 && api.selectedScrollSnap() !== index) {
        api.scrollTo(index, true)
      }
    })

    // Initial sync
    syncActiveGameFromEmbla()
  },
  { immediate: true },
)

/**
 * When featured game changes, load its details in the sidebar.
 */
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

function recordPlayingCardPointer(event: PointerEvent) {
  pointerDownPosition.value = {
    x: event.clientX,
    y: event.clientY,
  }
}

async function openPlayingCard(game: Game, event: PointerEvent | MouseEvent) {
  const start = pointerDownPosition.value
  pointerDownPosition.value = null

  if (start) {
    const deltaX = Math.abs(event.clientX - start.x)
    const deltaY = Math.abs(event.clientY - start.y)

    if (deltaX > 8 || deltaY > 8) {
      return
    }
  }

  await focusPlayingGame(game.id)
  await router.push({ name: 'game', params: { gameId: game.id } })
}

function goToHomeGame(index: number) {
  emblaApi.value?.scrollTo(index)
}

function refreshBacklogRecommendations() {
  const recommendations = recommendBacklogGames(games.value, journeys.value, {
    limit: 2,
    recentGameIds: recentRecommendationIds.value,
  })

  backlogRecommendations.value = recommendations
  recentRecommendationIds.value = [
    ...recentRecommendationIds.value,
    ...recommendations.map((recommendation) => recommendation.game.id),
  ].slice(-4)
}

function formatRecommendationMeta(game: Game) {
  return game.platform || t('home.platformFree')
}

function formatRecommendationBody(recommendation: BacklogRecommendation) {
  return recommendation.reasons.map(formatRecommendationReason).join(' · ')
}

function formatRecommendationReason(reason: RecommendationReason) {
  if (reason.kind === 'priority') {
    return t('home.recommendationReasonPriority', {
      priority: t(`priority.${reason.priority}` as MessageKey),
    })
  }

  if (reason.kind === 'taste') {
    return t('home.recommendationReasonTaste', { tag: reason.tag })
  }

  if (reason.kind === 'longWaiting') {
    return t('home.recommendationReasonLongWaiting', { months: reason.months })
  }

  return t('home.recommendationReasonReady')
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

function syncDesktopHomeLayout() {
  isDesktopHomeLayout.value = desktopHomeMediaQuery?.matches ?? false
}

if (typeof window !== 'undefined') {
  desktopHomeMediaQuery = window.matchMedia('(min-width: 1181px)')
  syncDesktopHomeLayout()
  desktopHomeMediaQuery.addEventListener('change', syncDesktopHomeLayout)
}

watch(
  () => activeHomeGames.value.length,
  async (count) => {
    if (count <= 1) {
      destroyEmbla()
      return
    }

    await nextTick()
    createEmbla()
  },
  { immediate: true },
)

watch(
  backlogRecommendationCandidates,
  (candidates) => {
    backlogRecommendations.value = backlogRecommendations.value.filter((recommendation) =>
      candidates.some((game) => game.id === recommendation.game.id),
    )
    recentRecommendationIds.value = recentRecommendationIds.value.filter((gameId) =>
      candidates.some((game) => game.id === gameId),
    )
  },
)

const wrappedYear = ref(finishedYearOptions.value[0] ?? '')

watch(finishedYearOptions, (options) => {
  if (options.length > 0 && !options.includes(wrappedYear.value)) {
    wrappedYear.value = options[0]
  }
})

const wrappedYearJourneys = computed(() =>
  finishedJourneyEntries.value.filter(
    ({ journey }) => journey.finishedAt?.startsWith(wrappedYear.value),
  ),
)

const wrappedPreviewText = computed(() => {
  const count = wrappedYearJourneys.value.length
  if (count === 0) return null
  const hours = wrappedYearJourneys.value.reduce((sum, { journey }) => sum + (journey.playTimeHours ?? 0), 0)
  return hours > 0
    ? t('wrapped.homePanelPreview', { count, hours })
    : t('wrapped.homePanelPreviewNoHours', { count })
})

onBeforeUnmount(() => {
  desktopHomeMediaQuery?.removeEventListener('change', syncDesktopHomeLayout)
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

    <main v-if="featuredGame || canUseLocalRecommendation" class="home-stack">
      <div v-if="featuredGame" class="home-featured-row">
        <section class="panel home-capture-panel">
          <img
            v-if="featuredGame.coverUrl"
            class="home-capture-backdrop"
            :src="featuredGame.coverUrl"
            alt=""
            aria-hidden="true"
          />
          <div class="section-heading">
            <div>
              <p class="section-kicker">{{ t('home.kicker') }}</p>
              <h2>{{ activeHomeGames.length === 1 ? t('home.activeGame') : t('home.activeGames') }}</h2>
            </div>
          </div>
          <div v-if="activeHomeGames.length <= 1" class="home-capture-header">
            <div class="home-capture-title-row home-capture-title-row--with-cover">
              <button
                type="button"
                class="home-capture-cover-button"
                :aria-label="t('home.openFullGamePage')"
                :title="t('home.openFullGamePage')"
                @click="router.push({ name: 'game', params: { gameId: featuredGame.id } })"
              >
                <GameCover
                  :title="featuredGame.title"
                  :cover-url="featuredGame.coverUrl"
                  size="small"
                />
              </button>
              <div>
                <h2 class="home-capture-title">{{ featuredGame.title }}</h2>
                <p class="home-capture-platform">{{ featuredGame.platform || t('home.platformFree') }}</p>
              </div>
            </div>
          </div>

          <div v-if="activeHomeGames.length > 1" class="home-now-playing-strip">
            <div class="home-playing-rail embla">
              <div ref="emblaViewportRef" class="embla__viewport" :aria-label="t('home.activeGamesAria')">
                <div class="embla__container">
                  <div v-for="game in activeHomeGames" :key="game.id" class="embla__slide">
                    <button
                      type="button"
                      class="playing-rail-card"
                      :class="{ active: featuredGame.id === game.id }"
                      :aria-label="t('home.openFullGamePage')"
                      :title="t('home.openFullGamePage')"
                      @pointerdown="recordPlayingCardPointer"
                      @click="openPlayingCard(game, $event)"
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

        <aside class="panel home-current-detail-panel">
          <div class="home-current-detail-header">
            <GameCover :title="featuredGame.title" :cover-url="featuredGame.coverUrl" size="small" />
            <div class="home-current-detail-copy">
              <p class="section-kicker">{{ t('home.currentGameKicker') }}</p>
              <h2>{{ featuredGame.title }}</h2>

              <div class="card-metadata-list detail-hero-metadata home-current-metadata">
                <template
                  v-for="(item, index) in [...featuredGameMetadata, ...featuredGame.tags]"
                  :key="`${item}-${index}`"
                >
                  <span>{{ item }}</span>
                  <span
                    v-if="index < featuredGameMetadata.length + featuredGame.tags.length - 1"
                    class="metadata-separator"
                    aria-hidden="true"
                  >&nbsp;·&nbsp;</span>
                </template>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <section class="home-grid">
        <HomeEmptyState v-if="!featuredGame" />

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
                    @click="updateCurrentJourneyStatus(game, 'playing')"
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
                    <IconExternalLink />
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
                <IconExternalLink />
              </RouterLink>
            </div>
          </div>
          <div v-else class="empty-state compact">
            <h3>{{ t('home.noRecentThoughts') }}</h3>
            <p>{{ t('home.noRecentThoughtsBody') }}</p>
          </div>
        </aside>

        <aside v-if="featuredGame" class="panel home-side-panel home-journey-panel">
          <div class="section-heading compact">
            <div>
              <p class="section-kicker">{{ t('home.journeyKicker') }}</p>
              <h2>{{ t('home.journeyTitle') }}</h2>
            </div>
          </div>

          <div class="home-journey-list">
            <div v-for="item in currentGameTimeline" :key="item.label" class="home-journey-item">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </div>
        </aside>

        <section
          v-if="canUseLocalRecommendation"
          class="panel home-side-panel home-choice-panel"
        >
          <div class="section-heading">
            <p class="section-kicker">{{ t('home.mioChoice') }}</p>
            <h3>{{ t('home.whatToPlayNext') }}</h3>
          </div>

          <p class="soft-meta">{{ t('home.recommendationBody') }}</p>
          <div class="home-ai-actions">
            <button
              class="icon-button large"
              type="button"
              :aria-label="backlogRecommendations.length > 0 ? t('home.recommendAgain') : t('home.recommendBacklogGames')"
              :title="backlogRecommendations.length > 0 ? t('home.recommendAgain') : t('home.recommendBacklogGames')"
              @click="refreshBacklogRecommendations"
            >
              <svg class="shelf-pick-icon" aria-hidden="true" viewBox="0 0 24 24">
                <rect x="4" y="4.85" width="12.25" height="2.26" rx="0.6" />
                <rect x="4" y="8.86" width="12.25" height="2.26" rx="0.6" />
                <rect x="7.76" y="12.87" width="12.25" height="2.26" rx="0.6" />
                <rect x="4" y="16.88" width="12.25" height="2.26" rx="0.6" />
              </svg>
            </button>
          </div>
          <div class="home-ai-list">
            <HomeChoiceCard
              v-for="recommendation in backlogRecommendations"
              :key="recommendation.game.id"
              :kicker="t('home.recommendedFromBacklog')"
              :title="recommendation.game.title"
              :cover-url="recommendation.game.coverUrl"
              :meta="formatRecommendationMeta(recommendation.game)"
              :body="formatRecommendationBody(recommendation)"
              :game-id="recommendation.game.id"
              :link-label="t('home.openRecommendedGame')"
            />
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
                <IconExternalLink />
              </RouterLink>
            </div>
          </div>
        </section>

        <section
          v-if="finishedYearOptions.length > 0"
          class="panel home-side-panel home-wrapped-panel"
        >
          <div class="section-heading compact">
            <div>
              <p class="section-kicker">{{ t('wrapped.homePanelKicker') }}</p>
              <h2>{{ t('wrapped.homePanelTitle') }}</h2>
            </div>
          </div>

          <div class="wrapped-year-picker">
            <button
              v-for="year in finishedYearOptions"
              :key="year"
              type="button"
              class="wrapped-year-chip"
              :class="{ active: year === wrappedYear }"
              @click="wrappedYear = year"
            >
              {{ year }}
            </button>
          </div>

          <p v-if="wrappedPreviewText" class="soft-meta">{{ wrappedPreviewText }}</p>

          <div class="home-current-actions">
            <RouterLink
              class="icon-button large"
              :aria-label="t('wrapped.viewWrapped', { year: wrappedYear })"
              :title="t('wrapped.viewWrapped', { year: wrappedYear })"
              :to="{ name: 'wrapped', query: { year: wrappedYear } }"
            >
              <IconExternalLink />
            </RouterLink>
          </div>
        </section>
      </section>
    </main>

    <HomeEmptyState v-else />
  </div>
</template>
