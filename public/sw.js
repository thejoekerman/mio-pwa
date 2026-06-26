const CACHE_VERSION = 'miolog-v3.2.1'
const SHELL_CACHE = `${CACHE_VERSION}-shell`
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`
const REMOTE_ARTWORK_HOSTS = new Set([
  'images.igdb.com',
  'upload.wikimedia.org',
])

/**
 * Fetch with timeout. If the request doesn't complete within `timeoutMs`,
 * rejects with a TimeoutError so we can fall back to cache immediately.
 * This prevents the app from hanging on slow connections with a black screen.
 */
function fetchWithTimeout(request, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Fetch timed out'))
    }, timeoutMs)

    fetch(request)
      .then((response) => {
        clearTimeout(timeoutId)
        resolve(response)
      })
      .catch((error) => {
        clearTimeout(timeoutId)
        reject(error)
      })
  })
}
const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.png',
  '/apple-touch-icon.png',
  '/apple-touch-icon-precomposed.png',
  '/pwa-icons/icon-180x180.png',
  '/pwa-icons/icon-192x192.png',
  '/pwa-icons/icon-512x512.png',
  '/pwa-icons/icon-512x512-maskable.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS)))
  // Intentionally NO skipWaiting() here: a new version waits until the client
  // (see usePwaUpdate) asks it to take over, so it can't tear assets out from
  // under a running page mid-session. First installs (no active worker) still
  // activate immediately on their own.
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            // Prune only our own stale shells/runtimes. Never touch other cache
            // buckets — notably @mlc-ai/web-llm's model weights ("webllm/*"),
            // which a blanket delete would wipe on every version bump.
            .filter(
              (key) =>
                key.startsWith('miolog-v') && key !== SHELL_CACHE && key !== RUNTIME_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') {
    return
  }

  const requestUrl = new URL(request.url)
  const isSameOrigin = requestUrl.origin === self.location.origin
  const isRemoteArtwork =
    request.destination === 'image' && REMOTE_ARTWORK_HOSTS.has(requestUrl.hostname)

  if (!isSameOrigin && !isRemoteArtwork) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetchWithTimeout(request, 3000)
        .then((response) => {
          const clonedResponse = response.clone()
          caches.open(RUNTIME_CACHE).then((cache) => cache.put('/index.html', clonedResponse))
          return response
        })
        .catch(async () => {
          const cachedDocument = await caches.match(request)
          if (cachedDocument) {
            return cachedDocument
          }

          return caches.match('/index.html')
        }),
    )

    return
  }

  const isStaticAsset =
    isRemoteArtwork ||
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font' ||
    requestUrl.pathname.startsWith('/assets/')

  if (!isStaticAsset) {
    return
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkResponse = fetchWithTimeout(request, 5000)
        .then((response) => {
          if (response.ok || response.type === 'opaque') {
            const clonedResponse = response.clone()
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clonedResponse))
          }

          return response
        })
        .catch(() => cachedResponse)

      return cachedResponse || networkResponse
    }),
  )
})
