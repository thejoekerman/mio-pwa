<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GameCover from '../components/GameCover.vue'
import { useBacklog } from '../composables/useBacklog'
import { useI18n } from '../i18n'

const { games, finishedYearOptions } = useBacklog()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const selectedYear = ref(
  typeof route.query.year === 'string' && finishedYearOptions.value.includes(route.query.year)
    ? route.query.year
    : (finishedYearOptions.value[0] ?? ''),
)

watch(finishedYearOptions, (options) => {
  if (options.length > 0 && !options.includes(selectedYear.value)) {
    selectedYear.value = options[0]
  }
})

const finishedGamesForYear = computed(() =>
  games.value
    .filter(
      (g) =>
        g.status === 'finished' &&
        g.deletedAt === null &&
        typeof g.finishedAt === 'string' &&
        g.finishedAt.startsWith(selectedYear.value),
    )
    .sort((a, b) => {
      if (!a.finishedAt || !b.finishedAt) return 0
      return a.finishedAt.localeCompare(b.finishedAt)
    }),
)

const totalPlayHours = computed(() => {
  const total = finishedGamesForYear.value.reduce((sum, g) => sum + (g.playTimeHours ?? 0), 0)
  return total > 0 ? total : null
})

const avgRating = computed(() => {
  const rated = finishedGamesForYear.value.filter((g) => g.rating !== null)
  if (rated.length === 0) return null
  const avg = rated.reduce((sum, g) => sum + g.rating!, 0) / rated.length
  return Math.round(avg * 10) / 10
})

const topPlatform = computed(() => {
  const counts = new Map<string, number>()
  for (const g of finishedGamesForYear.value) {
    if (g.platform) {
      counts.set(g.platform, (counts.get(g.platform) ?? 0) + 1)
    }
  }
  if (counts.size === 0) return null
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
})

const topTags = computed(() => {
  const counts = new Map<string, number>()
  for (const g of finishedGamesForYear.value) {
    for (const tag of g.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag)
})

const firstGame = computed(() => finishedGamesForYear.value[0] ?? null)
const lastGame = computed(() => {
  const last = finishedGamesForYear.value[finishedGamesForYear.value.length - 1] ?? null
  return last && last.id !== firstGame.value?.id ? last : null
})
</script>

<template>
  <main class="view-stack wrapped-view">
    <div class="wrapped-header">
      <button
        type="button"
        class="icon-button"
        :aria-label="t('wrapped.backToHome')"
        @click="router.push({ name: 'home' })"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <div>
        <p class="section-kicker">{{ t('wrapped.kicker') }}</p>
        <h1 class="view-title">{{ t('wrapped.title', { year: selectedYear || '—' }) }}</h1>
      </div>
    </div>

    <div v-if="finishedYearOptions.length === 0" class="panel">
      <div class="empty-state compact">
        <h3>{{ t('wrapped.noFinishedGames', { year: '—' }) }}</h3>
      </div>
    </div>

    <template v-else>
      <div class="wrapped-year-picker">
        <button
          v-for="year in finishedYearOptions"
          :key="year"
          type="button"
          class="wrapped-year-chip"
          :class="{ active: year === selectedYear }"
          @click="selectedYear = year"
        >
          {{ year }}
        </button>
      </div>

      <div v-if="finishedGamesForYear.length === 0" class="panel">
        <div class="empty-state compact">
          <h3>{{ t('wrapped.noFinishedGames', { year: selectedYear }) }}</h3>
        </div>
      </div>

      <template v-else>
        <section class="panel">
          <div class="shelf-grid">
            <RouterLink
              v-for="game in finishedGamesForYear"
              :key="game.id"
              class="shelf-game-card"
              :to="{ name: 'game', params: { gameId: game.id } }"
              :aria-label="game.title"
            >
              <GameCover :title="game.title" :cover-url="game.coverUrl" size="small" />
              <span v-if="game.platform" class="shelf-game-platform">{{ game.platform }}</span>
            </RouterLink>
          </div>
        </section>

        <div class="panel wrapped-stats-panel">
          <dl class="wrapped-stats-grid">
            <div class="wrapped-stat">
              <dt>{{ t('wrapped.gamesFinished') }}</dt>
              <dd>{{ finishedGamesForYear.length }}</dd>
            </div>
            <div v-if="totalPlayHours !== null" class="wrapped-stat">
              <dt>{{ t('wrapped.totalPlayTime') }}</dt>
              <dd>{{ totalPlayHours }} h</dd>
            </div>
            <div v-if="avgRating !== null" class="wrapped-stat">
              <dt>{{ t('wrapped.avgRating') }}</dt>
              <dd>{{ avgRating }}/10</dd>
            </div>
            <div v-if="topPlatform" class="wrapped-stat">
              <dt>{{ t('wrapped.topPlatform') }}</dt>
              <dd>{{ topPlatform }}</dd>
            </div>
            <div v-if="topTags.length > 0" class="wrapped-stat wrapped-stat--wide">
              <dt>{{ t('wrapped.topGenres') }}</dt>
              <dd>{{ topTags.join(' · ') }}</dd>
            </div>
            <div v-if="firstGame" class="wrapped-stat wrapped-stat--wide">
              <dt>{{ t('wrapped.firstFinished') }}</dt>
              <dd>{{ firstGame.title }}</dd>
            </div>
            <div v-if="lastGame" class="wrapped-stat wrapped-stat--wide">
              <dt>{{ t('wrapped.lastFinished') }}</dt>
              <dd>{{ lastGame.title }}</dd>
            </div>
          </dl>
        </div>
      </template>
    </template>
  </main>
</template>
