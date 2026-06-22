import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick, watchEffect } from 'vue'

describe('lazy locales', () => {
  afterEach(() => {
    window.localStorage.clear()
    vi.resetModules()
  })

  it('renders the English fallback until a newly selected locale has loaded, then reacts to it', async () => {
    const { ensureLocaleLoaded, useI18n } = await import('./i18n')
    const { t, setLanguage } = useI18n()
    let rendered = ''
    const stop = watchEffect(() => {
      rendered = t('nav.home')
    })

    expect(rendered).toBe('Home')

    setLanguage('de')
    // The first render can safely fall back while the split chunk is in flight.
    expect(rendered).toBe('Home')

    await ensureLocaleLoaded('de')
    await nextTick()

    expect(rendered).toBe('Start')
    stop()
  })
})
