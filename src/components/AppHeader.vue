<script setup lang="ts">
import { useI18n } from '../i18n'

defineProps<{
  stats: {
    backlog: number
    total: number
    playing: number
    ongoing: number
    finished: number
    playLogs: number
  }
}>()

const { t } = useI18n()
</script>

<template>
  <header class="hero">
    <div class="hero-intro">
      <p class="eyebrow">{{ t('hero.eyebrow') }}</p>
      <h1>{{ t('hero.title') }}</h1>
      <p class="lede">{{ t('hero.lede') }}</p>
    </div>

    <dl class="stats hero-stats">
      <div class="wrapped-stat">
        <dt>{{ t('hero.totalGames') }}</dt>
        <dd>{{ stats.total }}</dd>
      </div>
      <div class="wrapped-stat">
        <dt>{{ t('hero.currentlyPlaying') }}</dt>
        <dd>{{ stats.playing }}</dd>
      </div>
      <div class="wrapped-stat">
        <dt>{{ t('hero.ongoing') }}</dt>
        <dd>{{ stats.ongoing }}</dd>
      </div>
      <div class="wrapped-stat">
        <dt>{{ t('hero.finished') }}</dt>
        <dd>{{ stats.finished }}</dd>
      </div>
      <div class="wrapped-stat">
        <dt>{{ t('hero.playLogs') }}</dt>
        <dd>{{ stats.playLogs }}</dd>
      </div>
    </dl>
  </header>
</template>
