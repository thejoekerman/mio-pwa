import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import packageJson from '../../package.json'

describe('service worker versioning', () => {
  it('keeps the service-worker cache version aligned with the app version', () => {
    const serviceWorker = readFileSync(resolve('public/sw.js'), 'utf8')

    expect(serviceWorker).toContain(`const CACHE_VERSION = 'miolog-v${packageJson.version}'`)
  })

  it('caches artwork from supported remote providers', () => {
    const serviceWorker = readFileSync(resolve('public/sw.js'), 'utf8')

    expect(serviceWorker).toContain("'images.igdb.com'")
    expect(serviceWorker).toContain("'upload.wikimedia.org'")
    expect(serviceWorker).toContain('REMOTE_ARTWORK_HOSTS.has(requestUrl.hostname)')
  })
})
