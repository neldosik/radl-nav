const CACHE_NAME = 'radl-map-tiles-v1'

self.addEventListener('install', event => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // Автоматический кэш тайлов карты (MapLibre vector/raster tiles, cartography, fonts)
  const isMapAsset =
    url.hostname.includes('openfreemap') ||
    url.hostname.includes('cartocdn') ||
    url.hostname.includes('basemaps') ||
    url.hostname.includes('openstreetmap') ||
    url.hostname.includes('maptiler') ||
    url.pathname.includes('/tiles/') ||
    url.pathname.endsWith('.pbf') ||
    url.pathname.endsWith('.png')

  if (isMapAsset) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cachedResponse = await cache.match(event.request)
        if (cachedResponse) {
          // Если есть в кэше — выдаем мгновенно, в фоне обновляем при наличии сети
          fetch(event.request).then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse)
            }
          }).catch(() => {})
          return cachedResponse
        }

        try {
          const networkResponse = await fetch(event.request)
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone())
          }
          return networkResponse
        } catch (e) {
          return cachedResponse || Response.error()
        }
      })
    )
  }
})
