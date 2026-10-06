import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { injectOfflineAssets } from '../../build/offlineAssets'

const workerSource = readFileSync(resolve('public/sw.js'), 'utf8')
const origin = 'https://miolog.test'

type WorkerRequest = { url: string; method: string; mode: string; destination: string }
type WorkerEvent = {
  request?: WorkerRequest
  waitUntil: (promise: Promise<unknown>) => void
  respondWith?: (promise: Promise<Response | undefined>) => void
}

function createWorker(source: string) {
  const listeners = new Map<string, (event: WorkerEvent) => void>()
  const records = new Map<string, Response>()
  const lifetimeTasks: Promise<unknown>[] = []
  let offline = false
  const key = (request: string | WorkerRequest) =>
    new URL(typeof request === 'string' ? request : request.url, origin).href
  const fetchAsset = async (request: string | WorkerRequest) => {
    if (offline) throw new Error('Offline')
    return new Response(`asset: ${key(request)}`)
  }
  const cache = {
    addAll: async (urls: string[]) => {
      const responses = await Promise.all(urls.map(fetchAsset))
      urls.forEach((url, index) => records.set(key(url), responses[index]))
    },
    put: async (request: string | WorkerRequest, response: Response) => {
      records.set(key(request), response)
    },
  }

  runInNewContext(source, {
    self: {
      location: { origin },
      addEventListener: (name: string, callback: (event: WorkerEvent) => void) => {
        listeners.set(name, callback)
      },
    },
    caches: {
      open: async () => cache,
      match: async (request: string | WorkerRequest) => records.get(key(request))?.clone(),
    },
    fetch: fetchAsset,
    URL,
    setTimeout,
    clearTimeout,
  })

  return {
    lifetimeTasks,
    async install() {
      let installation: Promise<unknown> | undefined
      listeners.get('install')!({ waitUntil: (promise) => { installation = promise } })
      await installation
    },
    goOffline() { offline = true },
    async request(path: string, destination = 'script', mode = 'cors') {
      let response: Promise<Response | undefined> | undefined
      listeners.get('fetch')!({
        request: { url: new URL(path, origin).href, method: 'GET', mode, destination },
        waitUntil: (promise) => { lifetimeTasks.push(promise) },
        respondWith: (promise) => { response = promise },
      })
      return await response
    },
  }
}

describe('offline route assets', () => {
  it('keeps runtime cache writes alive and serves them offline afterward', async () => {
    const worker = createWorker(workerSource)
    await worker.install()
    await worker.request('/assets/WrappedView-test.js')
    expect(worker.lifetimeTasks).toHaveLength(1)
    await Promise.all(worker.lifetimeTasks)
    worker.goOffline()
    expect((await worker.request('/assets/WrappedView-test.js'))?.ok).toBe(true)
  })

  it('reproduces the missing lazy-route response without build precaching', async () => {
    const worker = createWorker(workerSource)
    await worker.install()
    worker.goOffline()
    expect(await worker.request('/assets/WrappedView-test.js')).toBeUndefined()
  })

  it('serves Wrapped on its first offline visit after installation', async () => {
    const worker = createWorker(injectOfflineAssets(workerSource, [
      'WrappedView-test.js', 'GameCover-test.js', 'index-test.css', 'ja-test.js',
    ]))
    await worker.install()
    worker.goOffline()
    for (const asset of ['WrappedView-test.js', 'GameCover-test.js', 'index-test.css', 'ja-test.js']) {
      const response = await worker.request(`/assets/${asset}`)
      expect(response?.ok).toBe(true)
    }
    expect((await worker.request('/wrapped?year=2026', 'document', 'navigate'))?.ok).toBe(true)
  })

  it('keeps optional WebLLM downloads out of the core precache', async () => {
    const worker = createWorker(injectOfflineAssets(workerSource, [
      'WrappedView-test.js', 'localReviewDraft-test.js', 'localReviewDraftWorker-test.js',
      'localReviewModels-test.js',
    ]))
    await worker.install()
    worker.goOffline()
    expect(await worker.request('/assets/localReviewDraft-test.js')).toBeUndefined()
    expect(await worker.request('/assets/localReviewDraftWorker-test.js')).toBeUndefined()
    expect((await worker.request('/assets/localReviewModels-test.js'))?.ok).toBe(true)
  })

  it('fails the build if the service-worker injection placeholder is removed', () => {
    expect(() => injectOfflineAssets('invalid worker', [])).toThrow('placeholder')
  })
})
