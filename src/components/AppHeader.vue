<script setup lang="ts">
import { useI18n } from '../i18n'
import { appDisplayName } from '../lib/appMode'

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
      <h1>{{ appDisplayName }}</h1>
      <p class="lede">{{ t('hero.lede') }}</p>
    </div>

    <div class="stats hero-stats">
      <article>
        <strong>{{ stats.total }}</strong>
        <span>{{ t('hero.totalGames') }}</span>
      </article>
      <article>
        <strong>{{ stats.playing }}</strong>
        <span>{{ t('hero.currentlyPlaying') }}</span>
      </article>
      <article>
        <strong>{{ stats.ongoing }}</strong>
        <span>{{ t('hero.ongoing') }}</span>
      </article>
      <article>
        <strong>{{ stats.finished }}</strong>
        <span>{{ t('hero.finished') }}</span>
      </article>
      <article>
        <strong>{{ stats.playLogs }}</strong>
        <span>{{ t('hero.playLogs') }}</span>
      </article>
    </div>
  </header>
</template>
