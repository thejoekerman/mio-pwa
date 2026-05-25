import { ref } from 'vue'
import { isDemoMode } from '../lib/appMode'
import { isInstallPromptEligible, type InstallPromptState } from '../lib/installPrompt'

/**
 * Owns the install-nudge state: localStorage persistence, the standalone check,
 * and the reactive flag the shell renders. The frequency policy itself lives in
 * `../lib/installPrompt` so it can be unit-tested without a DOM.
 *
 * The hard guarantee Tony cares about: an already-installed user is NEVER
 * nagged. iOS exposes no API to detect "already installed" while the site is
 * open in a Safari tab, so for that one Apple-limited edge case the cooldown
 * keeps it to at most a single, dismissible appearance.
 */
const STORAGE_KEY = isDemoMode ? 'miolog-demo-install-prompt' : 'miolog-install-prompt'

function readState(): InstallPromptState {
  const fallback: InstallPromptState = {
    visits: 0,
    shownCount: 0,
    lastShownAt: null,
    dismissedAt: null,
  }

  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return fallback
    }

    const parsed = JSON.parse(raw) as Partial<InstallPromptState>

    return {
      visits: typeof parsed.visits === 'number' ? parsed.visits : 0,
      shownCount: typeof parsed.shownCount === 'number' ? parsed.shownCount : 0,
      lastShownAt: typeof parsed.lastShownAt === 'number' ? parsed.lastShownAt : null,
      dismissedAt: typeof parsed.dismissedAt === 'number' ? parsed.dismissedAt : null,
    }
  } catch {
    return fallback
  }
}

function persist(state: InstallPromptState) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage can be unavailable (private mode, quota). Failing to remember the
    // prompt state should never break the app; worst case we re-evaluate later.
  }
}

/**
 * True when the app is running as an installed PWA. Checked two independent
 * ways — iOS's non-standard `navigator.standalone` and the standard
 * display-mode media queries — so a miss in one still suppresses the prompt.
 */
function isStandalone(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  const displayStandalone = ['standalone', 'fullscreen', 'minimal-ui'].some(
    (mode) => window.matchMedia?.(`(display-mode: ${mode})`).matches,
  )

  return iosStandalone || displayStandalone
}

const state = readState()
state.visits += 1
persist(state)

/**
 * Eligibility is snapshotted once, at startup, BEFORE the banner records itself
 * as shown — otherwise marking the show would immediately fail the re-show gate
 * and hide the banner mid-session. Future sessions re-read persisted state.
 */
const shouldOffer = ref(
  isInstallPromptEligible({ state, now: Date.now(), isDemo: isDemoMode, isStandalone: isStandalone() }),
)

/** Record that the banner was actually surfaced, so the cap/interval advance. */
function markOffered() {
  state.shownCount += 1
  state.lastShownAt = Date.now()
  persist(state)
}

/** User tapped the dismiss control — stay quiet for a full cooldown window. */
function dismiss() {
  state.dismissedAt = Date.now()
  persist(state)
  shouldOffer.value = false
}

/**
 * User opted in. Whether or not they finish the OS-level steps (iOS gives us no
 * way to know), treat it as handled and don't surface the banner again soon.
 */
function acknowledge() {
  state.dismissedAt = Date.now()
  persist(state)
  shouldOffer.value = false
}

export function usePwaInstall() {
  return { shouldOffer, markOffered, dismiss, acknowledge, isStandalone }
}
