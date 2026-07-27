// Zwei Aufgaben, zwei getrennte Puffer:
//   1. App-Hülle    — damit die App ohne Netz überhaupt startet
//   2. Kartenkacheln — damit die Karte unterwegs nicht weiß bleibt
// Version im Namen: ändert sie sich, werden alte Puffer beim Aktivieren gelöscht.
// Getrennt gezählt — eine neue Hülle soll nicht die gesammelten Kacheln
// wegwerfen, die unterwegs mühsam zusammengekommen sind.
const TILE_CACHE = 'radl-map-tiles-v3'
const SHELL_CACHE = 'radl-shell-v4'
// Ohne Obergrenze wächst der Kachelpuffer unbegrenzt, bei jeder Fahrt kommen welche dazu.
const MAX_TILES = 600

/**
 * Beim Einrichten die Hülle einmal aktiv holen.
 *
 * Ohne das griff der Puffer erst ab dem zweiten Start: beim ersten Besuch
 * übernimmt der Service Worker erst, wenn die Seite ihre Dateien längst
 * geladen hat — es gibt also keine `fetch`-Ereignisse mehr abzufangen, und
 * der Puffer blieb leer. Wer die App installiert und danach in die U-Bahn
 * steigt, stand vor einer weißen Seite.
 *
 * Die Namen der gebündelten Dateien enthalten einen Hash und stehen deshalb
 * nicht fest — wir lesen sie aus dem HTML und die Schriften aus dem CSS.
 */
async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE)
  const res = await fetch('./', { cache: 'reload' })
  if (!res.ok) return
  await cache.put('index.html', res.clone())

  const html = await res.text()
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map(m => m[1])
    .filter(u => /\.(js|css)$/.test(u))
    .map(u => new URL(u, self.registration.scope).href)

  // Schriften stehen nur im Stylesheet, nicht im HTML
  const fonts = []
  for (const url of refs.filter(u => u.endsWith('.css'))) {
    try {
      const cssRes = await fetch(url)
      if (!cssRes.ok) continue
      const css = await cssRes.text()
      for (const m of css.matchAll(/url\(["']?([^"')]+\.woff2?)["']?\)/g)) {
        fonts.push(new URL(m[1], url).href)
      }
    } catch {
      // Eine Datei weniger im Puffer, kein Grund die Einrichtung abzubrechen
    }
  }

  await Promise.all(
    [...new Set([...refs, ...fonts])].map(u =>
      cache.add(u).catch(() => {}),
    ),
  )
}

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      try {
        await precacheShell()
      } catch {
        // Kein Netz beim Einrichten — dann füllt sich der Puffer eben unterwegs
      }
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter(
            n =>
              (n.startsWith('radl-map-tiles-') || n.startsWith('radl-shell-')) &&
              n !== TILE_CACHE &&
              n !== SHELL_CACHE,
          )
          .map(n => caches.delete(n)),
      )
      await self.clients.claim()
    })(),
  )
})

/** Älteste Einträge wegwerfen, sobald die Grenze überschritten ist. */
async function trim(cache, max) {
  const keys = await cache.keys()
  if (keys.length <= max) return
  await Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)))
}

/** Kachel oder Kartenstil eines fremden Anbieters? */
function isMapAsset(url) {
  if (url.origin === self.location.origin) return false
  return (
    url.hostname.includes('openfreemap') ||
    url.hostname.includes('cartocdn') ||
    url.hostname.includes('basemaps') ||
    url.hostname.includes('openstreetmap') ||
    url.hostname.includes('maptiler') ||
    url.pathname.includes('/tiles/') ||
    url.pathname.endsWith('.pbf') ||
    url.pathname.endsWith('.png')
  )
}

/** Gebündelte Datei mit Inhalts-Hash im Namen (assets/index-Ct6hkmXj.js)? */
function isHashedAsset(url) {
  return url.origin === self.location.origin && url.pathname.includes('/assets/')
}

/** Eigene Datei der App-Hülle: Schrift, Symbol, Manifest. */
function isShellAsset(url) {
  if (url.origin !== self.location.origin) return false
  return /\.(woff2?|svg|png|webmanifest)$/.test(url.pathname)
}

/** Zuerst Puffer, dann Netz — für Dateien, deren Name den Inhalt festlegt. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res && res.status === 200) await cache.put(request, res.clone())
  return res
}

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // ── Das Dokument selbst ──────────────────────────────────────────────────
  // Netz zuerst, damit ein Deployment sofort ankommt; ohne Netz die zuletzt
  // bekannte Fassung. Vorher war die eigene Herkunft komplett ausgenommen —
  // die App startete offline gar nicht, obwohl die Stationsliste im
  // localStorage genau für diesen Fall vorgehalten wird.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req)
          if (res && res.status === 200) {
            const cache = await caches.open(SHELL_CACHE)
            await cache.put('index.html', res.clone())
          }
          return res
        } catch {
          const cache = await caches.open(SHELL_CACHE)
          return (await cache.match('index.html')) ?? Response.error()
        }
      })(),
    )
    return
  }

  // ── Gebündelte Dateien und Schriften ─────────────────────────────────────
  // Der Dateiname enthält den Inhalts-Hash, deshalb ist der Puffer gefahrlos:
  // ein neuer Build hat neue Namen und holt sich seine Dateien ohnehin frisch.
  if (isHashedAsset(url) || isShellAsset(url)) {
    event.respondWith(cacheFirst(req, SHELL_CACHE))
    return
  }

  // ── Kartenkacheln ────────────────────────────────────────────────────────
  if (!isMapAsset(url)) return

  event.respondWith(
    caches.open(TILE_CACHE).then(async cache => {
      const cached = await cache.match(req)
      if (cached) {
        // Sofort ausliefern, im Hintergrund auffrischen
        fetch(req)
          .then(res => {
            if (res && res.status === 200) cache.put(req, res).then(() => trim(cache, MAX_TILES))
          })
          .catch(() => {})
        return cached
      }
      try {
        const res = await fetch(req)
        if (res && res.status === 200) {
          await cache.put(req, res.clone())
          await trim(cache, MAX_TILES)
        }
        return res
      } catch {
        return cached || Response.error()
      }
    }),
  )
})
