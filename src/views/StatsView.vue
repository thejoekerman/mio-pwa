<script setup lang="ts">
import { computed } from 'vue'
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js'
import { Bar, Doughnut, Line } from 'vue-chartjs'
import { useBacklog } from '../composables/useBacklog'
import { useSettings } from '../composables/useSettings'
import { useI18n } from '../i18n'
import {
  getBacklogPressure,
  getPlatformMix,
  getPlayLogsOverTime,
  getStatusDistribution,
} from '../lib/statsAnalytics'
import type { GameStatus } from '../types'

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
)

const { games, journeyLogs, journeys, stats } = useBacklog()
const { settings } = useSettings()
const { statusLabel, t } = useI18n()

const chartColors = computed(() => {
  if (settings.theme === 'polar') {
    return {
      accent: '#007f95',
      accentSoft: 'rgba(0, 127, 149, 0.22)',
      blue: '#2563eb',
      green: '#0f8f68',
      orange: '#b45309',
      pink: '#be185d',
      red: '#d9405a',
      teal: '#008fa3',
      muted: '#31536f',
      grid: 'rgba(0, 80, 120, 0.16)',
      surfaceBorder: 'rgba(0, 80, 120, 0.16)',
      playLogFill: 'rgba(190, 24, 93, 0.14)',
      platformFill: 'rgba(37, 99, 235, 0.2)',
    }
  }

  return {
    accent: '#c084fc',
    accentSoft: 'rgba(192, 132, 252, 0.38)',
    blue: '#60a5fa',
    green: '#34d399',
    orange: '#f59e0b',
    pink: '#f472b6',
    red: '#fb7185',
    teal: '#2dd4bf',
    muted: 'rgba(248, 250, 252, 0.68)',
    grid: 'rgba(248, 250, 252, 0.12)',
    surfaceBorder: 'rgba(255, 255, 255, 0.08)',
    playLogFill: 'rgba(244, 114, 182, 0.2)',
    platformFill: 'rgba(96, 165, 250, 0.36)',
  }
})

const visibleJourneys = computed(() => journeys.value.filter((journey) => journey.deletedAt === null))
const finishedGameCount = computed(() =>
  games.value.filter((game) => game.deletedAt === null && game.status === 'finished').length,
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
const activeGameCount = computed(() =>
  games.value.filter(
    (game) => game.deletedAt === null && (game.status === 'playing' || game.status === 'ongoing'),
  ).length,
)
const statusDistribution = computed(() => getStatusDistribution(games.value))
const platformMix = computed(() => getPlatformMix(games.value))
const backlogPressure = computed(() => getBacklogPressure(games.value))
const playLogActivity = computed(() => getPlayLogsOverTime(journeyLogs.value))
const hasAverageRating = computed(() => averageRating.value !== null)

const headlineStats = computed(() => [
  { label: t('statsView.games'), value: games.value.length },
  { label: t('statsView.finishedGames'), value: finishedGameCount.value },
  { label: t('statsView.playLogs'), value: stats.value.playLogs },
  { label: t('statsView.activeGames'), value: activeGameCount.value },
  { label: t('statsView.playTime'), value: `${totalPlayHours.value} h` },
  ...(hasAverageRating.value
    ? [{ label: t('statsView.averageRating'), value: `${averageRating.value}/10` }]
    : []),
])

const doughnutOptions = computed<ChartOptions<'doughnut'>>(() => ({
  cutout: '62%',
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: {
        color: chartColors.value.muted,
        boxWidth: 10,
        padding: 14,
      },
    },
  },
}))

const barOptions = computed<ChartOptions<'bar'>>(() => ({
  maintainAspectRatio: false,
  responsive: true,
  plugins: {
    legend: {
      labels: { color: chartColors.value.muted },
    },
  },
  scales: {
    x: {
      grid: { color: chartColors.value.grid },
      ticks: { autoSkip: true, color: chartColors.value.muted, maxRotation: 0, maxTicksLimit: 6, precision: 0 },
    },
    y: {
      beginAtZero: true,
      grid: { color: chartColors.value.grid },
      ticks: { color: chartColors.value.muted, precision: 0, stepSize: 1 },
    },
  },
}))

const horizontalBarOptions = computed<ChartOptions<'bar'>>(() => ({
  ...barOptions.value,
  indexAxis: 'y',
  scales: {
    x: {
      beginAtZero: true,
      grid: { color: chartColors.value.grid },
      ticks: { color: chartColors.value.muted, maxTicksLimit: 5, precision: 0, stepSize: 1 },
    },
    y: {
      grid: { color: chartColors.value.grid },
      ticks: { color: chartColors.value.muted },
    },
  },
}))

const lineOptions = computed<ChartOptions<'line'>>(() => ({
  maintainAspectRatio: false,
  responsive: true,
  plugins: {
    legend: { display: false },
  },
  scales: {
    x: {
      grid: { color: chartColors.value.grid },
      ticks: { autoSkip: true, color: chartColors.value.muted, maxRotation: 0, maxTicksLimit: 6 },
    },
    y: {
      beginAtZero: true,
      grid: { color: chartColors.value.grid },
      ticks: { color: chartColors.value.muted, precision: 0 },
    },
  },
}))

const statusChartData = computed<ChartData<'doughnut', number[], string>>(() => ({
  labels: statusDistribution.value.map((point) => statusLabel(point.label as GameStatus)),
  datasets: [{
    data: statusDistribution.value.map((point) => point.value),
    backgroundColor: [
      chartColors.value.accent,
      chartColors.value.blue,
      chartColors.value.teal,
      chartColors.value.green,
      chartColors.value.orange,
      chartColors.value.red,
    ],
    borderColor: chartColors.value.surfaceBorder,
    borderWidth: 1,
  }],
}))

const backlogPressureChartData = computed<ChartData<'bar', number[], string>>(() => ({
  labels: backlogPressure.value.map((point) => pressureLabel(point.label)),
  datasets: [{
    label: t('statsView.games'),
    data: backlogPressure.value.map((point) => point.value),
    backgroundColor: chartColors.value.accentSoft,
    borderColor: chartColors.value.accent,
    borderWidth: 1,
  }],
}))

const playLogChartData = computed<ChartData<'line', number[], string>>(() => ({
  labels: playLogActivity.value.map((point) => formatMonth(point.label)),
  datasets: [{
    label: t('statsView.playLogs'),
    data: playLogActivity.value.map((point) => point.value),
    borderColor: chartColors.value.pink,
    backgroundColor: chartColors.value.playLogFill,
    pointBackgroundColor: chartColors.value.pink,
    tension: 0.35,
    fill: true,
  }],
}))

const platformChartData = computed<ChartData<'bar', number[], string>>(() => ({
  labels: platformMix.value.map((point) => point.label),
  datasets: [{
    label: t('statsView.games'),
    data: platformMix.value.map((point) => point.value),
    backgroundColor: chartColors.value.platformFill,
    borderColor: chartColors.value.blue,
    borderWidth: 1,
  }],
}))

function formatMonth(value: string) {
  const [year, month] = value.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)

  return new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit' }).format(date)
}

function pressureLabel(value: string) {
  if (value === 'active') {
    return t('statsView.activeGames')
  }

  if (value === 'finished') {
    return t('statsView.finishedGames')
  }

  return t('statsView.backlogGames')
}
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

      <section class="stats-section stats-section--headline">
        <dl class="stats-kpi-grid stats-kpi-grid--primary">
          <div
            v-for="item in headlineStats"
            :key="item.label"
            class="wrapped-stat"
          >
            <dt>{{ item.label }}</dt>
            <dd>{{ item.value }}</dd>
          </div>
        </dl>
      </section>

      <section class="stats-chart-grid">
        <article class="stats-chart-card">
          <div>
            <h2>{{ t('statsView.libraryShape') }}</h2>
            <p>{{ t('statsView.libraryShapeHint') }}</p>
          </div>
          <div
            v-if="statusDistribution.length > 0"
            class="stats-chart stats-chart--doughnut"
          >
            <Doughnut
              :data="statusChartData"
              :options="doughnutOptions"
            />
          </div>
          <p
            v-else
            class="stats-empty"
          >
            {{ t('statsView.noneYet') }}
          </p>
        </article>

        <article class="stats-chart-card stats-chart-card--wide">
          <div>
            <h2>{{ t('statsView.backlogPressure') }}</h2>
            <p>{{ t('statsView.backlogPressureHint') }}</p>
          </div>
          <div
            v-if="backlogPressure.length > 0"
            class="stats-chart"
          >
            <Bar
              :data="backlogPressureChartData"
              :options="horizontalBarOptions"
            />
          </div>
          <p
            v-else
            class="stats-empty"
          >
            {{ t('statsView.noneYet') }}
          </p>
        </article>

        <article class="stats-chart-card">
          <div>
            <h2>{{ t('statsView.journalActivity') }}</h2>
            <p>{{ t('statsView.journalActivityHint') }}</p>
          </div>
          <div
            v-if="playLogActivity.length > 0"
            class="stats-chart"
          >
            <Line
              :data="playLogChartData"
              :options="lineOptions"
            />
          </div>
          <p
            v-else
            class="stats-empty"
          >
            {{ t('statsView.noneYet') }}
          </p>
        </article>

        <article class="stats-chart-card">
          <div>
            <h2>{{ t('statsView.platformMix') }}</h2>
            <p>{{ t('statsView.platformMixHint') }}</p>
          </div>
          <div
            v-if="platformMix.length > 0"
            class="stats-chart"
          >
            <Bar
              :data="platformChartData"
              :options="horizontalBarOptions"
            />
          </div>
          <p
            v-else
            class="stats-empty"
          >
            {{ t('statsView.noneYet') }}
          </p>
        </article>
      </section>
    </section>
  </main>
</template>
