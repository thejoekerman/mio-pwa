<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import TrophyUnlockDialog from './components/TrophyUnlockDialog.vue'
import { useBacklog } from './composables/useBacklog'
import { useSettings } from './composables/useSettings'
import { useI18n } from './i18n'
import { isDemoMode } from './lib/appMode'

const route = useRoute()
const router = useRouter()
const {
  clearFeedback,
  dismissTrophyUnlocks,
  feedback,
  latestTrophyUnlockSource,
  trophyUnlockQueue,
} = useBacklog()
const { settings } = useSettings()
const { t } = useI18n()
const lastMainRoute = ref<{ name: string; params?: Record<string, string> } | null>(null)
const topbarCompact = ref(false)
let feedbackTimer: number | null = null

const navItems = computed(() => [
  { label: t('nav.home'), name: 'home' },
  { label: t('nav.library'), name: 'library' },
  { label: t('nav.add'), name: 'add-game' },
])

const settingsOpen = computed(() => route.name === 'settings')
const journalOpen = computed(() => route.name === 'journal')
const settingsIcon = computed(() =>
  settings.theme === 'mio' ? '/miolog-cog-mio.svg' : '/miolog-cog.svg',
)

function updateTopbarDensity() {
  topbarCompact.value = window.scrollY > 24
}

/**
 * Throttled scroll handler using requestAnimationFrame.
 * Ensures updateTopbarDensity runs at most once per frame.
 */
let pendingScroll = false

function handleScrollThrottled() {
  if (pendingScroll) {
    return
  }

  pendingScroll = true
  requestAnimationFrame(() => {
    updateTopbarDensity()
    pendingScroll = false
  })
}

onMounted(() => {
  updateTopbarDensity()
  window.addEventListener('scroll', handleScrollThrottled, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', handleScrollThrottled)
})

watch(
  () => route.name,
  () => {
    if (!['settings', 'journal'].includes(String(route.name)) && typeof route.name === 'string') {
      lastMainRoute.value = {
        name: route.name,
        params: route.params as Record<string, string> | undefined,
      }
    }
  },
  { immediate: true },
)

watch(
  feedback,
  (entry) => {
    if (feedbackTimer !== null) {
      window.clearTimeout(feedbackTimer)
      feedbackTimer = null
    }

    if (!entry) {
      return
    }

    const duration = entry.tone === 'error' ? 4500 : entry.tone === 'info' ? 3200 : 2600

    feedbackTimer = window.setTimeout(() => {
      clearFeedback()
      feedbackTimer = null
    }, duration)
  },
  { immediate: true },
)

async function toggleSettings() {
  if (settingsOpen.value) {
    if (lastMainRoute.value) {
      await router.push(lastMainRoute.value)
      return
    }

    await router.push({ name: 'home' })
    return
  }

  await router.push({ name: 'settings' })
}

async function toggleJournal() {
  if (journalOpen.value) {
    if (lastMainRoute.value) {
      await router.push(lastMainRoute.value)
      return
    }

    await router.push({ name: 'home' })
    return
  }

  await router.push({ name: 'journal' })
}

</script>

<template>
  <VApp :theme="settings.theme" class="miolog-v-app">
    <div class="app-shell">
      <VToolbar class="app-topbar" :class="{ 'is-compact': topbarCompact }" flat>
        <button
          class="brand-mark"
          type="button"
          :class="{ active: journalOpen }"
          :aria-expanded="journalOpen"
          :aria-label="t('nav.journalLabel')"
          @click="toggleJournal"
        >
          <img src="/miolog-head.svg" alt="" />
        </button>
        <span v-if="isDemoMode" class="demo-badge">{{ t('app.demoBadge') }}</span>
        <div class="topbar-tools">
          <VBtn
            class="settings-link"
            :class="{ active: settingsOpen }"
            icon
            type="button"
            :aria-expanded="settingsOpen"
            :aria-label="t('nav.settings')"
            @click="toggleSettings"
          >
            <img :src="settingsIcon" alt="" />
          </VBtn>
        </div>
      </VToolbar>

      <div v-if="feedback" class="app-toast-wrap" aria-live="polite">
        <p class="app-toast" :class="feedback.tone">
          {{ feedback.message }}
        </p>
      </div>

      <div class="shell shell--journal shell--app">
        <RouterView />
      </div>

      <TrophyUnlockDialog
        :unlocks="trophyUnlockQueue"
        :source="latestTrophyUnlockSource"
        @close="dismissTrophyUnlocks"
      />

      <nav class="bottom-nav" :aria-label="t('nav.primary')">
        <div class="bottom-nav__content">
          <VBtn
            v-for="item in navItems"
            :key="item.name"
            :to="{ name: item.name }"
            :value="item.name"
            variant="text"
          >
            <span>{{ item.label }}</span>
          </VBtn>
        </div>
      </nav>
    </div>
  </VApp>
</template>
