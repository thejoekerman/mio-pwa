const CACHE_VERSION = 'miolog-public-v1'
const SHELL_CACHE = `${CACHE_VERSION}-shell`
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`
const APP_SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/pwa-icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
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
      fetch(request).catch(async () => {
        const cachedDocument = await caches.match(request)
        return cachedDocument || caches.match('/index.html')
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
