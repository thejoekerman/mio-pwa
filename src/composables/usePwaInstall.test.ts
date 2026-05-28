import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// usePwaInstall is a module-level singleton that reads + writes localStorage
// at import time (bumping the visit counter), so each scenario re-imports the
// module with a clean localStorage and tailored standalone / demo mocks.

const STORAGE_KEY = 'miolog-install-prompt'

interface StoredPromptState {
  visits: number
  shownCount: number
  lastShownAt: number | null
  dismissedAt: number | null
}

function readStored(): StoredPromptState | null {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  return raw ? (JSON.parse(raw) as StoredPromptState) : null
}

function seed(state: Partial<StoredPromptState>) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      visits: 0,
      shownCount: 0,
      lastShownAt: null,
      dismissedAt: null,
      ...state,
    }),
  )
}

async function loadPwaInstall(opts: { standalone?: boolean; demoMode?: boolean } = {}) {
  const { standalone = false, demoMode = false } = opts

  vi.resetModules()

  vi.doMock('../lib/appMode', () => ({
    isDemoMode: demoMode,
    isDesktopMode: false,
    appDisplayName: demoMode ? 'MioLog Demo' : 'MioLog',
  }))

  // Both signals the composable uses to detect "already installed".
  Object.defineProperty(navigator, 'standalone', { value: standalone, configurable: true })
  window.matchMedia = vi.fn((query: string) => ({
    matches: standalone && query.includes('standalone'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia

  return await import('./usePwaInstall')
}

describe('usePwaInstall', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.doUnmock('../lib/appMode')
    vi.resetModules()
  })

  describe('visit counter', () => {
    it('increments visits on each fresh import and persists the new count', async () => {
      seed({ visits: 4 })
      await loadPwaInstall()

      expect(readStored()?.visits).toBe(5)
    })

    it('starts at 1 when nothing is stored yet', async () => {
      await loadPwaInstall()
      expect(readStored()?.visits).toBe(1)
    })

    it('recovers gracefully from a corrupted localStorage blob', async () => {
      window.localStorage.setItem(STORAGE_KEY, '{not valid json')
      await loadPwaInstall()
      // Treats the bad blob as no state, then increments the seeded fallback.
      expect(readStored()?.visits).toBe(1)
    })
  })

  describe('eligibility', () => {
    it('never offers when the app is already running standalone', async () => {
      seed({ visits: 10 }) // plenty of visits — but standalone trumps
      const { usePwaInstall } = await loadPwaInstall({ standalone: true })
      const { shouldOffer, isStandalone } = usePwaInstall()
      expect(isStandalone()).toBe(true)
      expect(shouldOffer.value).toBe(false)
    })

    it('never offers in demo mode', async () => {
      seed({ visits: 10 })
      const { usePwaInstall } = await loadPwaInstall({ demoMode: true })
      expect(usePwaInstall().shouldOffer.value).toBe(false)
    })

    it('does NOT offer on the very first visit (MIN_VISITS gate)', async () => {
      // No seed → after import visits becomes 1, which is below MIN_VISITS (2).
      const { usePwaInstall } = await loadPwaInstall()
      expect(usePwaInstall().shouldOffer.value).toBe(false)
    })

    it('offers from the second visit onwards in a clean state', async () => {
      seed({ visits: 1 })
      const { usePwaInstall } = await loadPwaInstall()
      expect(usePwaInstall().shouldOffer.value).toBe(true)
    })
  })

  describe('markOffered / dismiss / acknowledge', () => {
    it('markOffered bumps shownCount and lastShownAt', async () => {
      seed({ visits: 1 })
      const before = Date.now()
      const { usePwaInstall } = await loadPwaInstall()
      usePwaInstall().markOffered()

      const stored = readStored()!
      expect(stored.shownCount).toBe(1)
      expect(stored.lastShownAt).toBeGreaterThanOrEqual(before)
    })

    it('dismiss flips shouldOffer off and stamps dismissedAt', async () => {
      seed({ visits: 1 })
      const { usePwaInstall } = await loadPwaInstall()
      const { shouldOffer, dismiss } = usePwaInstall()
      expect(shouldOffer.value).toBe(true)

      dismiss()

      expect(shouldOffer.value).toBe(false)
      expect(readStored()?.dismissedAt).not.toBeNull()
    })

    it('acknowledge behaves like dismiss (treat opted-in users as handled)', async () => {
      seed({ visits: 1 })
      const { usePwaInstall } = await loadPwaInstall()
      const { shouldOffer, acknowledge } = usePwaInstall()
      expect(shouldOffer.value).toBe(true)

      acknowledge()

      expect(shouldOffer.value).toBe(false)
      expect(readStored()?.dismissedAt).not.toBeNull()
    })
  })
})
