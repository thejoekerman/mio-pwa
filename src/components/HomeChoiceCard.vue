<script setup lang="ts">
import { RouterLink } from 'vue-router'
import GameCover from './GameCover.vue'

defineProps<{
  kicker: string
  title: string
  gameId?: string | null
  externalUrl?: string | null
  linkLabel: string
  coverUrl?: string | null
  meta?: string | null
  body?: string | null
}>()
</script>

<template>
  <article class="home-ai-suggestion home-choice-card">
    <div class="home-choice-cover">
      <GameCover :title="title" :cover-url="coverUrl" size="small" />
    </div>
    <div class="home-choice-copy">
      <p class="section-kicker">{{ kicker }}</p>
      <h3 class="home-ai-card-title">{{ title }}</h3>
      <p v-if="meta" class="soft-meta">{{ meta }}</p>
      <p v-if="body">{{ body }}</p>
      <div class="home-ai-actions">
        <RouterLink
          v-if="gameId"
          class="icon-button large"
          :aria-label="linkLabel"
          :title="linkLabel"
          :to="{ name: 'game', params: { gameId } }"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M15 3h6v6" />
            <path d="M10 14 21 3" />
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          </svg>
        </RouterLink>
        <a
          v-else-if="externalUrl"
          class="icon-button large"
          :href="externalUrl"
          target="_blank"
          rel="noreferrer"
          :aria-label="linkLabel"
          :title="linkLabel"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M15 3h6v6" />
            <path d="M10 14 21 3" />
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          </svg>
        </a>
      </div>
    </div>
  </article>
</template>
