/**
 * Pure policy for the PWA install nudge. Kept separate from the Vue composable
 * (which owns localStorage + reactivity) so the "never nag an installed user"
 * guarantee can be unit-tested in isolation.
 */

export const MIN_VISITS = 2 // never on first run
export const MAX_SHOWS = 3 // lifetime cap if simply ignored
export const RESHOW_MS = 7 * 24 * 60 * 60 * 1000 // wait a week between ignored re-shows
export const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000 // stay quiet a month after a dismiss

export interface InstallPromptState {
  visits: number
  shownCount: number
  lastShownAt: number | null
  dismissedAt: number | null
}

export interface EligibilityInput {
  state: InstallPromptState
  now: number
  isDemo: boolean
  isStandalone: boolean
}

/**
 * Whether the install banner may surface this session. The first two gates are
 * absolute: an installed (standalone) app and the seeded demo never prompt. The
 * rest enforce gentleness — not on first run, not past the lifetime cap, and not
 * inside a cooldown (after a dismiss) or re-show interval (after being ignored).
 */
export function isInstallPromptEligible({
  state,
  now,
  isDemo,
  isStandalone,
}: EligibilityInput): boolean {
  if (isDemo || isStandalone) {
    return false
  }

  if (state.visits < MIN_VISITS || state.shownCount >= MAX_SHOWS) {
    return false
  }

  if (state.dismissedAt !== null && now - state.dismissedAt < COOLDOWN_MS) {
    return false
  }

  if (state.lastShownAt !== null && now - state.lastShownAt < RESHOW_MS) {
    return false
  }

  return true
}
