import type maplibregl from 'maplibre-gl'

export type ThemeMode = 'light' | 'dark'

/** OpenFreeMap-Stile: helle Karte am Tag, dunkle bei Dark Mode (blendet nachts nicht). */
export function mapStyleUrl(theme: ThemeMode): string {
  return theme === 'dark'
    ? 'https://tiles.openfreemap.org/styles/dark'
    : 'https://tiles.openfreemap.org/styles/liberty'
}

/** Kennung der Radwege-Ebene, damit sie sich gezielt an- und abschalten lässt. */
export const CYCLE_LAYER = 'cyclosm-radwege'
const CYCLE_SOURCE = 'cyclosm'

/**
 * Radwege als halbdurchsichtige Ebene über der Grundkarte.
 *
 * Bewusst *über* der bestehenden Karte statt als Ersatz: die Grundkarte bleibt
 * vektoriell und wechselt mit dem Thema, CyclOSM steuert nur die Radinfra-
 * struktur bei — Radwege, Radspuren, Belag. Die Routenführung bleibt davon
 * völlig unberührt, die kommt weiterhin von MOTIS.
 *
 * Kacheln von OpenStreetMap France (CyclOSM), ohne Schlüssel.
 */
export function addCycleLayer(m: maplibregl.Map, sichtbar: boolean) {
  if (!m.getSource(CYCLE_SOURCE)) {
    m.addSource(CYCLE_SOURCE, {
      type: 'raster',
      tiles: [
        'https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
        'https://b.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
        'https://c.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      maxzoom: 18,
      attribution:
        '<a href="https://www.cyclosm.org/">CyclOSM</a> | Kacheln: <a href="https://openstreetmap.fr/">OSM France</a>',
    })
  }
  if (!m.getLayer(CYCLE_LAYER)) {
    // Unter die Routenlinie legen, sonst deckt die Rasterkachel sie zu.
    const davor = m.getLayer('route-casing') ? 'route-casing' : undefined
    m.addLayer(
      {
        id: CYCLE_LAYER,
        type: 'raster',
        source: CYCLE_SOURCE,
        paint: { 'raster-opacity': 0.55 },
        layout: { visibility: sichtbar ? 'visible' : 'none' },
      },
      davor,
    )
  } else {
    m.setLayoutProperty(CYCLE_LAYER, 'visibility', sichtbar ? 'visible' : 'none')
  }
}

/**
 * Farbe der Etappenlinie — gleiche Sprache wie die Oberfläche:
 * Petrol fürs Rad, warmes Grau für Fußwege, Tinte für den ÖPNV.
 */
export function routeColors(theme: ThemeMode) {
  return {
    bike: theme === 'dark' ? '#35a091' : '#1f7a6f',
    walk: theme === 'dark' ? '#8f887d' : '#a49c8d',
    transit: theme === 'dark' ? '#f4f1ea' : '#24211c',
    casing: theme === 'dark' ? '#12100f' : '#24211c',
  }
}

/**
 * Legt Quelle + Layer der Route an. Wird beim ersten Laden UND nach jedem
 * Stilwechsel gebraucht, weil setStyle() alle eigenen Layer entfernt.
 */
export function addRouteLayers(m: maplibregl.Map, theme: ThemeMode) {
  if (m.getSource('route')) return
  m.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

  const dimmed = (normal: number, dim: number) =>
    ['case', ['boolean', ['get', 'dim'], false], dim, normal] as unknown as number
  const c = routeColors(theme)

  m.addLayer({
    id: 'route-casing',
    type: 'line',
    source: 'route',
    paint: { 'line-color': c.casing, 'line-width': 7, 'line-opacity': dimmed(0.85, 0.15) },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  })
  m.addLayer({
    id: 'route-solid',
    type: 'line',
    source: 'route',
    filter: ['!', ['get', 'dash']],
    paint: { 'line-color': ['get', 'color'], 'line-width': 4.5, 'line-opacity': dimmed(1, 0.25) },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  })
  m.addLayer({
    id: 'route-dash',
    type: 'line',
    source: 'route',
    filter: ['get', 'dash'],
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 3.5,
      'line-dasharray': [0.5, 1.6],
      'line-opacity': dimmed(1, 0.25),
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  })
}
