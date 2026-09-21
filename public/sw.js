const STATIC_PRECACHE = [
  '/manifest.json',
  '/offline.html',
  '/icons/portal-icon-192.png',
]

/** Set from sw-manifest.json during install/activate. */
let CACHE_NAME = 'hshb-portal-bootstrap'

async function loadManifest() {
  const response = await fetch('/sw-manifest.json', { cache: 'no-store' })
  if (!response.ok) throw new Error(`sw-manifest.json ${response.status}`)
  return response.json()
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    loadManifest()
      .then((manifest) => {
        CACHE_NAME = manifest.cacheName
        return caches
          .open(CACHE_NAME)
          .then((cache) =>
            cache.addAll([...STATIC_PRECACHE, ...(manifest.urls ?? [])]),
          )
      })
      .catch(() =>
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_PRECACHE)),
      ),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    loadManifest()
      .then((manifest) => {
        CACHE_NAME = manifest.cacheName
        return caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
            ),
          )
      })
      .catch(() =>
        caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
            ),
          ),
      ),
  )
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

  // App shell assets: cache-first (content-hashed, immutable)
  if (
    url.pathname.startsWith('/_next/static/chunks/') ||
    url.pathname.startsWith('/_next/static/media/') ||
    url.pathname.startsWith('/_next/static/css/')
  ) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            const clone = response.clone()
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, clone))
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
