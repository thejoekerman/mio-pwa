<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import GameCover from '../components/GameCover.vue'
import { useBacklog } from '../composables/useBacklog'
import { useI18n } from '../i18n'
import { generateWrappedShareCard } from '../lib/wrappedShareCard'
import { projectJourneyGame } from '../lib/journeyAnalytics'

const { finishedJourneyEntries, finishedYearOptions } = useBacklog()
const { t } = useI18n()
const route = useRoute()

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

const finishedJourneysForYear = computed(() =>
  finishedJourneyEntries.value
    .filter(
      ({ journey }) => journey.finishedAt?.startsWith(selectedYear.value),
    )
    .sort((a, b) => {
      if (!a.journey.finishedAt || !b.journey.finishedAt) return 0
      return a.journey.finishedAt.localeCompare(b.journey.finishedAt)
    }),
)
const finishedGamesForYear = computed(() => finishedJourneysForYear.value.map(projectJourneyGame))

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
  for (const { journey } of finishedJourneysForYear.value) {
    if (journey.platform) {
      counts.set(journey.platform, (counts.get(journey.platform) ?? 0) + 1)
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

const firstEntry = computed(() => finishedJourneysForYear.value[0] ?? null)
const lastEntry = computed(() => {
  const last = finishedJourneysForYear.value[finishedJourneysForYear.value.length - 1] ?? null
  return last && last.journey.id !== firstEntry.value?.journey.id ? last : null
})

function entryTitle(entry: typeof firstEntry.value) {
  if (!entry) return ''

  return entry.isReplay
    ? t('wrapped.replayTitle', { title: entry.game.title, number: entry.journeyNumber })
    : entry.game.title
}

const isSharingCard = ref(false)

async function shareWrapped() {
  isSharingCard.value = true
  try {
    const blob = await generateWrappedShareCard(finishedGamesForYear.value, {
      year: selectedYear.value,
      count: finishedGamesForYear.value.length,
      totalPlayHours: totalPlayHours.value,
      avgRating: avgRating.value,
      topPlatform: topPlatform.value,
    })
    const file = new File([blob], `miolog-wrapped-${selectedYear.value}.png`, { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `My ${selectedYear.value} in games — MioLog` })
    } else {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      a.click()
      URL.revokeObjectURL(url)
    }
  } catch {
    // user cancelled or share failed — no feedback needed
  } finally {
    isSharingCard.value = false
  }
}
</script>

<template>
  <main class="view-stack wrapped-view">
    <div class="panel wrapped-panel">
      <button
        v-if="finishedGamesForYear.length > 0"
        type="button"
        class="icon-button detail-back-button"
        :disabled="isSharingCard"
        :aria-label="isSharingCard ? t('wrapped.sharingCard') : t('wrapped.shareCard', { year: selectedYear })"
        :title="isSharingCard ? t('wrapped.sharingCard') : t('wrapped.shareCard', { year: selectedYear })"
        @click="shareWrapped"
      >
        <span v-if="isSharingCard" class="button-spinner" aria-hidden="true" />
        <svg v-else aria-hidden="true" viewBox="0 0 24 24">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
      </button>
      <div class="section-heading">
        <div>
          <p class="section-kicker">{{ t('wrapped.kicker') }}</p>
          <h2>{{ t('wrapped.yearInReview') }}</h2>
        </div>
      </div>

      <div v-if="finishedYearOptions.length > 0" class="wrapped-year-picker">
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

      <div v-if="finishedYearOptions.length === 0" class="empty-state compact">
        <h3>{{ t('wrapped.noFinishedGames', { year: '—' }) }}</h3>
      </div>

      <template v-else-if="finishedGamesForYear.length === 0">
        <div class="empty-state compact">
          <h3>{{ t('wrapped.noFinishedGames', { year: selectedYear }) }}</h3>
        </div>
      </template>

      <template v-else>
        <div class="shelf-grid">
          <RouterLink
            v-for="entry in finishedJourneysForYear"
            :key="entry.journey.id"
            class="shelf-game-card"
            :to="{ name: 'game', params: { gameId: entry.game.id } }"
            :aria-label="entry.game.title"
          >
            <GameCover :title="entry.game.title" :cover-url="entry.game.coverUrl" size="small" />
            <span v-if="entry.isReplay" class="shelf-game-platform">{{ t('wrapped.replay') }}</span>
            <span v-else-if="entry.journey.platform" class="shelf-game-platform">{{ entry.journey.platform }}</span>
          </RouterLink>
        </div>

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
          <div v-if="firstEntry" class="wrapped-stat wrapped-stat--wide">
            <dt>{{ t('wrapped.firstFinished') }}</dt>
            <dd>{{ entryTitle(firstEntry) }}</dd>
          </div>
          <div v-if="lastEntry" class="wrapped-stat wrapped-stat--wide">
            <dt>{{ t('wrapped.lastFinished') }}</dt>
            <dd>{{ entryTitle(lastEntry) }}</dd>
          </div>
        </dl>
      </template>
    </div>
  </main>
</template>
