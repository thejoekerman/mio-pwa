import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'

const ASSET_PLACEHOLDER = '/* INJECT_BUILD_ASSETS */ []'

export function injectOfflineAssets(worker: string, assetNames: string[]): string {
  if (!worker.includes(ASSET_PLACEHOLDER)) {
    throw new Error('Service worker is missing its build asset placeholder')
  }

  // Cache core routes, their dependencies, styles, and locale chunks before the
  // app goes offline. The optional WebLLM runtime stays an on-demand download.
  const urls = assetNames
    .filter((name) => /\.(js|css)$/.test(name))
    .filter((name) => !/^localReviewDraft(?:Worker)?-/.test(name))
    .map((name) => `/assets/${name}`)
    .sort()

  return worker.replace(ASSET_PLACEHOLDER, JSON.stringify(urls))
}

export function offlineAssetsPlugin(): Plugin {
  let config: ResolvedConfig

  return {
    name: 'miolog-offline-assets',
    apply: 'build',
    configResolved(resolved) {
      config = resolved
    },
    async closeBundle() {
      if (process.env.VITE_APP_MODE === 'demo' || process.env.VITE_APP_TARGET === 'desktop') {
        return
      }

      const outputDirectory = resolve(config.root, config.build.outDir)
      const workerPath = resolve(outputDirectory, 'sw.js')
      const worker = await readFile(workerPath, 'utf8')
      const assets = await readdir(resolve(outputDirectory, 'assets'), { recursive: true })
      await writeFile(workerPath, injectOfflineAssets(worker, assets))
    },
  }
}
