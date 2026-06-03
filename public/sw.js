const CACHE_VERSION = 'miolog-v2.3.1'
const SHELL_CACHE = `${CACHE_VERSION}-shell`
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`
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
  const isIgdbImage = request.destination === 'image' && requestUrl.hostname === 'images.igdb.com'

  if (!isSameOrigin && !isIgdbImage) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
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
    isIgdbImage ||
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
      const networkResponse = fetch(request)
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
