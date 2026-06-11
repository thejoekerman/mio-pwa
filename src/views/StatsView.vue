<script setup lang="ts">
import { computed } from 'vue'
import { useBacklog } from '../composables/useBacklog'
import { useI18n } from '../i18n'

const { finishedJourneyEntries, games, journeys, stats } = useBacklog()
const { t } = useI18n()

const visibleJourneys = computed(() => journeys.value.filter((journey) => journey.deletedAt === null))
const completedReplays = computed(() =>
  finishedJourneyEntries.value.filter((entry) => entry.isReplay).length,
)
const totalPlayHours = computed(() =>
  visibleJourneys.value.reduce((total, journey) => total + (journey.playTimeHours ?? 0), 0),
)
const averageRating = computed(() => {
  const ratings = visibleJourneys.value
    .map((journey) => journey.rating)
    .filter((rating): rating is number => rating !== null)

  return ratings.length > 0
    ? Math.round((ratings.reduce((total, rating) => total + rating, 0) / ratings.length) * 10) / 10
    : null
})
const reviewCount = computed(() =>
  visibleJourneys.value.filter((journey) => journey.review.trim() !== '').length,
)
const activeJourneyCount = computed(() =>
  visibleJourneys.value.filter((journey) => journey.status === 'playing' || journey.status === 'ongoing').length,
)
const pausedJourneyCount = computed(() =>
  visibleJourneys.value.filter((journey) => journey.status === 'paused').length,
)
const finishedThisYear = computed(() => {
  const year = String(new Date().getFullYear())

  return finishedJourneyEntries.value.filter(({ journey }) => journey.finishedAt?.startsWith(year)).length
})
const topPlatform = computed(() => {
  const counts = new Map<string, number>()

  for (const journey of visibleJourneys.value) {
    if (journey.platform.trim()) {
      counts.set(journey.platform, (counts.get(journey.platform) ?? 0) + 1)
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null
})
</script>

<template>
  <main class="view-stack stats-view">
    <section class="panel stats-overview">
      <div class="section-heading">
        <div>
          <p class="section-kicker">{{ t('statsView.kicker') }}</p>
          <h1 class="view-title">{{ t('statsView.title') }}</h1>
          <p class="soft-meta">{{ t('statsView.body') }}</p>
        </div>
      </div>

      <section class="stats-section">
        <h2>{{ t('statsView.library') }}</h2>
        <dl class="stats-kpi-grid stats-kpi-grid--primary">
          <div class="wrapped-stat">
            <dt>{{ t('statsView.games') }}</dt>
            <dd>{{ games.length }}</dd>
          </div>
          <div class="wrapped-stat">
            <dt>{{ t('statsView.journeys') }}</dt>
            <dd>{{ visibleJourneys.length }}</dd>
          </div>
          <div class="wrapped-stat">
            <dt>{{ t('statsView.finishedJourneys') }}</dt>
            <dd>{{ stats.finished }}</dd>
          </div>
          <div class="wrapped-stat">
            <dt>{{ t('statsView.completedReplays') }}</dt>
            <dd>{{ completedReplays }}</dd>
          </div>
        </dl>
      </section>

      <section class="stats-section">
        <h2>{{ t('statsView.playHistory') }}</h2>
        <dl class="stats-kpi-grid">
          <div class="wrapped-stat">
            <dt>{{ t('statsView.playTime') }}</dt>
            <dd>{{ totalPlayHours }} h</dd>
          </div>
          <div class="wrapped-stat">
            <dt>{{ t('statsView.averageRating') }}</dt>
            <dd>{{ averageRating === null ? t('statsView.noneYet') : `${averageRating}/10` }}</dd>
          </div>
          <div class="wrapped-stat">
            <dt>{{ t('statsView.reviews') }}</dt>
            <dd>{{ reviewCount }}</dd>
          </div>
          <div class="wrapped-stat">
            <dt>{{ t('statsView.playLogs') }}</dt>
            <dd>{{ stats.playLogs }}</dd>
          </div>
        </dl>
      </section>

      <section class="stats-section">
        <h2>{{ t('statsView.rightNow') }}</h2>
        <dl class="stats-kpi-grid">
          <div class="wrapped-stat">
            <dt>{{ t('statsView.activeJourneys') }}</dt>
            <dd>{{ activeJourneyCount }}</dd>
          </div>
          <div class="wrapped-stat">
            <dt>{{ t('statsView.backlogJourneys') }}</dt>
            <dd>{{ stats.backlog }}</dd>
          </div>
          <div class="wrapped-stat">
            <dt>{{ t('statsView.pausedJourneys') }}</dt>
            <dd>{{ pausedJourneyCount }}</dd>
          </div>
          <div class="wrapped-stat">
            <dt>{{ t('statsView.finishedThisYear') }}</dt>
            <dd>{{ finishedThisYear }}</dd>
          </div>
          <div class="wrapped-stat stats-kpi-wide">
            <dt>{{ t('statsView.topPlatform') }}</dt>
            <dd>{{ topPlatform ?? t('statsView.noneYet') }}</dd>
          </div>
        </dl>
      </section>
    </section>
  </main>
</template>
