// Kartenkacheln offline vorhalten. Version im Namen: ändert sie sich, werden
// alte Caches beim Aktivieren gelöscht — vorher blieben sie ewig liegen.
const CACHE_VERSION = 'v2'
const CACHE_NAME = `radl-map-tiles-${CACHE_VERSION}`
// Ohne Obergrenze wächst der Cache unbegrenzt, bei jeder Fahrt kommen Kacheln dazu.
const MAX_ENTRIES = 600

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter(n => n.startsWith('radl-map-tiles-') && n !== CACHE_NAME)
          .map(n => caches.delete(n)),
      )
      await self.clients.claim()
    })(),
  )
})

/** Älteste Einträge wegwerfen, sobald die Grenze überschritten ist. */
async function trim(cache) {
  const keys = await cache.keys()
  if (keys.length <= MAX_ENTRIES) return
  await Promise.all(keys.slice(0, keys.length - MAX_ENTRIES).map(k => cache.delete(k)))
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // Nur fremde Kartenquellen puffern. Eigene Dateien bleiben außen vor — sonst
  // liefert der Cache nach einem Deploy weiter den alten Stand aus.
  const isOwnOrigin = url.origin === self.location.origin
  const isMapAsset =
    !isOwnOrigin &&
    (url.hostname.includes('openfreemap') ||
      url.hostname.includes('cartocdn') ||
      url.hostname.includes('basemaps') ||
      url.hostname.includes('openstreetmap') ||
      url.hostname.includes('maptiler') ||
      url.pathname.includes('/tiles/') ||
      url.pathname.endsWith('.pbf') ||
      url.pathname.endsWith('.png'))

  if (!isMapAsset) return

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(event.request)
      if (cached) {
        // Sofort ausliefern, im Hintergrund auffrischen
        fetch(event.request)
          .then(res => {
            if (res && res.status === 200) cache.put(event.request, res).then(() => trim(cache))
          })
          .catch(() => {})
        return cached
      }

      try {
        const res = await fetch(event.request)
        if (res && res.status === 200) {
          await cache.put(event.request, res.clone())
          await trim(cache)
        }
        return res
      } catch {
        return cached || Response.error()
      }
    }),
  )
})
