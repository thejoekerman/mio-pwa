<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import TrophyUnlockDialog from './components/TrophyUnlockDialog.vue'
import { useBacklog } from './composables/useBacklog'
import { useSettings } from './composables/useSettings'
import { usePwaInstall } from './composables/usePwaInstall'
import { usePwaUpdate } from './composables/usePwaUpdate'
import { useI18n } from './i18n'
import { isDemoMode } from './lib/appMode'

const route = useRoute()
const router = useRouter()
const {
  clearFeedback,
  dismissTrophyUnlocks,
  feedback,
  isLoading,
  latestTrophyUnlockSource,
  trophyUnlockQueue,
} = useBacklog()
const { settings } = useSettings()
const {
  shouldOffer: showInstallBanner,
  markOffered: markInstallOffered,
  dismiss: dismissInstall,
  acknowledge: acknowledgeInstall,
} = usePwaInstall()
const { t } = useI18n()
const { updateAvailable, applyUpdate } = usePwaUpdate()

type PwaInstallElement = HTMLElement & {
  showDialog: (forced?: boolean) => void
  isInstallAvailable?: boolean
  isAppleMobilePlatform?: boolean
  isAppleDesktopPlatform?: boolean
}
const pwaInstall = ref<PwaInstallElement | null>(null)
// Only surface the banner where install is genuinely actionable: an Apple
// platform (manual instructions / Add to Dock) or a Chromium browser that has
// captured `beforeinstallprompt`. Keeps the dead button off Firefox and off
// dev-mode Chrome (no service worker → no install).
const installActionable = ref(false)
let installOffered = false

function refreshInstallActionable() {
  const el = pwaInstall.value

  if (!el || !showInstallBanner.value || installActionable.value) {
    return
  }

  if (!(el.isAppleMobilePlatform || el.isAppleDesktopPlatform || el.isInstallAvailable)) {
    return
  }

  installActionable.value = true

  // Count the show only when the banner actually surfaces (see usePwaInstall).
  if (!installOffered) {
    installOffered = true
    markInstallOffered()
  }
}

function promptInstall() {
  pwaInstall.value?.showDialog(true)
  acknowledgeInstall()
}
const lastMainRoute = ref<{ name: string; params?: Record<string, string> } | null>(null)
const topbarCompact = ref(false)
const topbarHidden = ref(false)
let feedbackTimer: number | null = null
let lastScrollY = 0

const navItems = computed(() => [
  { label: t('nav.home'), name: 'home' },
  { label: t('nav.library'), name: 'library' },
  { label: t('nav.add'), name: 'add-game' },
])

const settingsOpen = computed(() => route.name === 'settings')
const journalOpen = computed(() => route.name === 'journal')
const brandHead = computed(() =>
  settings.theme === 'preemNeon' ? '/miolog-head-cyber.svg' : '/miolog-head.svg',
)
const settingsIcon = computed(() =>
  settings.theme === 'mio' ? '/miolog-cog-mio.svg' : '/miolog-cog.svg',
)
const showStartup = ref(isLoading.value)

watch(
  isLoading,
  (loading) => {
    if (!loading) {
      showStartup.value = false
    }
  },
  { immediate: true },
)

function updateTopbarDensity() {
  const y = window.scrollY
  topbarCompact.value = y > 24
  topbarHidden.value = y > 80 && y > lastScrollY
  lastScrollY = y
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

  if (showInstallBanner.value) {
    // Apple flags are ready synchronously; Chromium availability may arrive
    // later via the event, so check now and listen for it.
    refreshInstallActionable()
    pwaInstall.value?.addEventListener('pwa-install-available-event', refreshInstallActionable)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', handleScrollThrottled)
  pwaInstall.value?.removeEventListener('pwa-install-available-event', refreshInstallActionable)
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
    <div v-if="showStartup" class="app-startup" role="status" aria-live="polite">
      <img class="app-startup-mark" :src="brandHead" alt="" />
      <div class="app-startup-copy">
        <p class="app-startup-title">MioLog</p>
        <p class="app-startup-text">{{ t('app.openingJournal') }}</p>
      </div>
    </div>

    <div v-else class="app-shell">
      <VToolbar class="app-topbar" :class="{ 'is-compact': topbarCompact, 'is-hidden': topbarHidden }" flat>
        <button
          class="brand-mark"
          type="button"
          :class="{ active: journalOpen }"
          :aria-expanded="journalOpen"
          :aria-label="t('nav.journalLabel')"
          @click="toggleJournal"
        >
          <img :src="brandHead" alt="" />
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

      <div v-if="updateAvailable" class="app-update-banner" role="status">
        <span>{{ t('app.updateAvailable') }}</span>
        <button type="button" class="app-update-reload" @click="applyUpdate">
          {{ t('app.updateReload') }}
        </button>
      </div>

      <div v-if="showInstallBanner && installActionable" class="app-install-banner" role="status">
        <span>{{ t('app.installPrompt') }}</span>
        <div class="app-install-actions">
          <button type="button" class="app-install-action" @click="promptInstall">
            {{ t('app.installAction') }}
          </button>
          <button
            type="button"
            class="app-install-dismiss"
            :aria-label="t('app.installDismiss')"
            @click="dismissInstall"
          >
            ×
          </button>
        </div>
      </div>

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

      <pwa-install
        ref="pwaInstall"
        manifest-url="/manifest.webmanifest"
        name="MioLog"
        description="A local-first game journal for your backlog, reviews, and play logs."
        icon="/pwa-icons/icon-192x192.png"
      ></pwa-install>
    </div>
  </VApp>
</template>
