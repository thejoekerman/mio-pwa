<script setup lang="ts">
import { computed, ref, watch } from 'vue'

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
const failedCoverUrl = ref<string | null>(null)
const coverFit = ref<'fill' | 'contain' | null>(null)
const coverLoaded = ref(false)
const visibleCoverUrl = computed(() =>
  props.coverUrl && props.coverUrl !== failedCoverUrl.value ? props.coverUrl : null,
)
const coverStyle = computed(() => ({
  ...fallbackStyle.value,
  '--cover-image': visibleCoverUrl.value ? `url("${visibleCoverUrl.value}")` : 'none',
}))

watch(
  () => props.coverUrl,
  () => {
    failedCoverUrl.value = null
    coverFit.value = null
    coverLoaded.value = false
  },
)

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

function handleCoverLoad(event: Event) {
  const image = event.target

  if (!(image instanceof HTMLImageElement)) {
    return
  }

  const ratio = image.naturalWidth / image.naturalHeight
  const frameRatio = 3 / 4

  coverFit.value = Math.abs(ratio - frameRatio) <= 0.08 ? 'fill' : 'contain'
  coverLoaded.value = true
}
</script>

<template>
  <div
    class="game-cover"
    :class="[
      `game-cover--${size}`,
      {
        'game-cover--contained-source': coverFit === 'contain',
      },
    ]"
    :style="coverStyle"
    :role="visibleCoverUrl ? undefined : 'img'"
    :aria-label="visibleCoverUrl ? undefined : title"
  >
    <img
      v-if="visibleCoverUrl"
      :src="visibleCoverUrl"
      :alt="title"
      :class="{ loaded: coverLoaded }"
      loading="lazy"
      @load="handleCoverLoad"
      @error="failedCoverUrl = visibleCoverUrl"
    />
    <div v-else class="game-cover-fallback">
      <span class="game-cover-mark">{{ initials }}</span>
      <span class="game-cover-title">{{ title }}</span>
    </div>
  </div>
</template>
