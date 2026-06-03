import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Apple startup images', () => {
  it('references existing splash images from index.html', () => {
    const indexHtml = readFileSync(resolve('index.html'), 'utf8')
    const startupImageUrls = [...indexHtml.matchAll(/rel="apple-touch-startup-image"\s+href="([^"]+)"/g)]
      .map((match) => match[1])

    expect(startupImageUrls).toContain('/splash/splash-1170x2532.png')
    expect(startupImageUrls).toContain('/splash/splash-2532x1170.png')

    for (const url of startupImageUrls) {
      expect(existsSync(resolve('public', url.replace(/^\//, '')))).toBe(true)
    }
  })
})
