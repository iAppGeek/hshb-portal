// CACHE_NAME, STATIC_PRECACHE, BUILD_PRECACHE and IS_DEV are prepended by
// scripts/build-sw.mjs, which writes the result to public/sw.js. The cache name
// is a hash of the build's assets, the static precache files and this template,
// so any change to them alters this file's bytes — that is what makes the
// browser install the new worker.

const CACHE_PREFIX = 'hshb-portal-'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all([
        // Required: without the offline page the worker is not worth installing.
        cache.addAll(STATIC_PRECACHE),
        // Best effort: addAll is all-or-nothing, so one missing build asset
        // would block every future update. A miss is fetched on first use.
        Promise.allSettled(BUILD_PRECACHE.map((url) => cache.add(url))),
      ]),
    ),
  )
  self.skipWaiting()
})

// Keeps the newest previous app cache: a tab opened before this deploy may
// still lazy-load chunks from the old build, which the server no longer has.
// caches.keys() is in creation order. Caches this worker did not create are
// left alone.
async function purgeOldCaches() {
  const others = (await caches.keys()).filter(
    (k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME,
  )
  const previous = others.at(-1)
  await Promise.all(
    others.filter((k) => k !== previous).map((k) => caches.delete(k)),
  )
}

self.addEventListener('activate', (event) => {
  event.waitUntil(purgeOldCaches())
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Never cache auth endpoints or API routes
  if (url.pathname.startsWith('/api/') || url.pathname.includes('/auth/')) {
    return
  }

  // Navigation requests (HTML pages): network-only, offline page as fallback.
  // Portal pages hold live student data, so a cached copy would show stale
  // records after a save and leave personal data in browser storage.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/offline.html')),
    )
    return
  }

  // Build assets: cache-first (content-hashed, immutable). Dev chunks are not
  // hashed, so caching them would serve stale code.
  if (
    !IS_DEV &&
    (url.pathname.startsWith('/_next/static/chunks/') ||
      url.pathname.startsWith('/_next/static/media/') ||
      url.pathname.startsWith('/_next/static/css/'))
  ) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            if (response.ok) {
              const clone = response.clone()
              caches
                .open(CACHE_NAME)
                .then((cache) => cache.put(event.request, clone))
            }
            return response
          }),
      ),
    )
    return
  }

  // Everything else: network-first with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request)),
  )
})

self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : {}
  const title = payload.title ?? 'Staff Portal'
  const body = payload.body ?? ''
  const data = payload.data ?? {}
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/portal-icon-192.png',
      badge: '/icons/portal-icon-192.png',
      data,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/reports'
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        const selfOrigin = new URL(
          self.registration?.scope || self.location.href,
        ).origin
        for (const client of windowClients) {
          try {
            if (
              new URL(client.url).origin === selfOrigin &&
              'focus' in client
            ) {
              client.focus()
              return client.navigate(url)
            }
          } catch {
            // ignore invalid client url
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url)
        }
      }),
  )
})
