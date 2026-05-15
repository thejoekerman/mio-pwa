<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    coverUrl?: string | null
    size?: 'small' | 'large'
    title: string
  }>(),
  {
    coverUrl: null,
    size: 'small',
  },
)

const palettes = [
  ['#2f5f9f', '#e4b15f'],
  ['#673a6f', '#f1a7b7'],
  ['#276a63', '#d7d080'],
  ['#7c3f35', '#f3c26f'],
  ['#33475f', '#8fd0d6'],
  ['#5c4b91', '#d9b7ff'],
]

const fallbackStyle = computed(() => {
  const hash = [...props.title].reduce((total, character) => total + character.charCodeAt(0), 0)
  const [base, accent] = palettes[hash % palettes.length]

  return {
    '--cover-base': base,
    '--cover-accent': accent,
  }
})

const initials = computed(() => {
  const words = props.title
    .replace(/[^\dA-Za-z ]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) {
    return '??'
  }

  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
})
</script>

<template>
  <div
    class="game-cover"
    :class="`game-cover--${size}`"
    :style="fallbackStyle"
    role="img"
    :aria-label="title"
  >
    <img v-if="coverUrl" :src="coverUrl" :alt="title" loading="lazy" />
    <div v-else class="game-cover-fallback">
      <span class="game-cover-mark">{{ initials }}</span>
      <span class="game-cover-title">{{ title }}</span>
    </div>
  </div>
</template>
