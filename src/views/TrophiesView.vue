<script setup lang="ts">
import { computed } from 'vue'
import TrophyIcon from '../components/TrophyIcon.vue'
import { useBacklog } from '../composables/useBacklog'
import { useI18n } from '../i18n'

const { formatDate, trophyViews, earnedTrophyViews } = useBacklog()
const { t } = useI18n()

const latestTrophy = computed(() =>
  [...earnedTrophyViews.value]
    .filter((trophy) => trophy.earnedAt)
    .sort((left, right) => String(right.earnedAt).localeCompare(String(left.earnedAt)))[0] ?? null,
)
const lockedTrophyCount = computed(() => trophyViews.value.length - earnedTrophyViews.value.length)
const completionPercent = computed(() =>
  trophyViews.value.length === 0
    ? 0
    : Math.round((earnedTrophyViews.value.length / trophyViews.value.length) * 100),
)
</script>

<template>
  <main class="view-stack trophies-view">
    <section class="panel trophies-panel">
      <div class="section-heading">
        <div>
          <p class="section-kicker">{{ t('trophies.panelKicker') }}</p>
          <h1 class="view-title">{{ t('trophies.cabinetTitle') }}</h1>
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

      <dl class="trophy-stats-grid">
        <div class="wrapped-stat">
          <dt>{{ t('trophies.earnedStat') }}</dt>
          <dd>{{ earnedTrophyViews.length }}</dd>
        </div>
        <div class="wrapped-stat">
          <dt>{{ t('trophies.lockedStat') }}</dt>
          <dd>{{ lockedTrophyCount }}</dd>
        </div>
        <div class="wrapped-stat">
          <dt>{{ t('trophies.latestStat') }}</dt>
          <dd>{{ latestTrophy ? t(latestTrophy.titleKey) : t('trophies.noneYet') }}</dd>
        </div>
        <div class="wrapped-stat">
          <dt>{{ t('trophies.completionStat') }}</dt>
          <dd>{{ completionPercent }}%</dd>
        </div>
      </dl>

      <div class="trophy-shelf">
        <article
          v-for="trophy in trophyViews"
          :key="trophy.id"
          class="trophy-shelf-card"
          :class="{ earned: trophy.earned }"
        >
          <TrophyIcon :icon-key="trophy.iconKey" :earned="trophy.earned" />
          <div class="trophy-shelf-card-copy">
            <p class="section-kicker">
              {{ trophy.earned && trophy.earnedAt ? formatDate(trophy.earnedAt) : t('trophies.lockedStatus') }}
            </p>
            <h2>{{ t(trophy.titleKey) }}</h2>
            <p>{{ t(trophy.descriptionKey) }}</p>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>
