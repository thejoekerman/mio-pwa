import { describe, expect, it } from 'vitest'
import {
  COOLDOWN_MS,
  RESHOW_MS,
  MAX_SHOWS,
  isInstallPromptEligible,
  type InstallPromptState,
} from './installPrompt'

const NOW = 1_700_000_000_000

function state(overrides: Partial<InstallPromptState> = {}): InstallPromptState {
  return {
    visits: 2,
    shownCount: 0,
    lastShownAt: null,
    dismissedAt: null,
    ...overrides,
  }
}

function eligible(overrides: Partial<Parameters<typeof isInstallPromptEligible>[0]> = {}) {
  return isInstallPromptEligible({
    state: state(),
    now: NOW,
    isDemo: false,
    isStandalone: false,
    ...overrides,
  })
}

describe('isInstallPromptEligible', () => {
  it('offers to an engaged, non-installed user on a return visit', () => {
    expect(eligible()).toBe(true)
  })

  // The hard guarantee: an installed user is never nagged.
  it('never offers when running as an installed (standalone) app', () => {
    expect(eligible({ isStandalone: true })).toBe(false)
  })

  it('never offers in the seeded demo', () => {
    expect(eligible({ isDemo: true })).toBe(false)
  })

  it('never offers on the first run', () => {
    expect(eligible({ state: state({ visits: 1 }) })).toBe(false)
  })

  it('stops after the lifetime cap is reached', () => {
    expect(eligible({ state: state({ shownCount: MAX_SHOWS }) })).toBe(false)
  })

  it('stays quiet during the cooldown after a dismiss', () => {
    expect(eligible({ state: state({ dismissedAt: NOW - (COOLDOWN_MS - 1) }) })).toBe(false)
  })

  it('may offer again once the dismiss cooldown has elapsed', () => {
    expect(eligible({ state: state({ dismissedAt: NOW - (COOLDOWN_MS + 1) }) })).toBe(true)
  })

  it('stays quiet during the re-show interval after being ignored', () => {
    expect(eligible({ state: state({ shownCount: 1, lastShownAt: NOW - (RESHOW_MS - 1) }) })).toBe(
      false,
    )
  })

  it('may offer again once the re-show interval has elapsed', () => {
    expect(eligible({ state: state({ shownCount: 1, lastShownAt: NOW - (RESHOW_MS + 1) }) })).toBe(
      true,
    )
  })

  it('prioritizes the installed gate even when otherwise eligible', () => {
    expect(eligible({ state: state({ visits: 99 }), isStandalone: true })).toBe(false)
  })
})
