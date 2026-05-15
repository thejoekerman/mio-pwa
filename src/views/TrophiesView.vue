<script setup lang="ts">
import TrophyIcon from '../components/TrophyIcon.vue'
import { useBacklog } from '../composables/useBacklog'
import { useI18n } from '../i18n'

const { formatDate, trophyViews, earnedTrophyViews } = useBacklog()
const { t } = useI18n()
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

      <div class="trophy-shelf">
        <article
          v-for="trophy in trophyViews"
          :key="trophy.id"
          class="trophy-shelf-card"
          :class="{ earned: trophy.earned }"
        >
          <TrophyIcon :icon-key="trophy.iconKey" :earned="trophy.earned" />
          <div>
            <p class="section-kicker">
              {{ trophy.earned && trophy.earnedAt ? formatDate(trophy.earnedAt) : t('trophies.notEarned') }}
            </p>
            <h2>{{ trophy.earned && trophy.earnedAt ? t(trophy.titleKey) : t('trophies.locked') }}</h2>
            <p>{{ trophy.earned && trophy.earnedAt ? t(trophy.descriptionKey) : t('trophies.locked') }}</p>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>
