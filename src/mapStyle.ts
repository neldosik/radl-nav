import type maplibregl from 'maplibre-gl'

export type ThemeMode = 'light' | 'dark'

/** OpenFreeMap-Stile: helle Karte am Tag, dunkle bei Dark Mode (blendet nachts nicht). */
export function mapStyleUrl(theme: ThemeMode): string {
  return theme === 'dark'
    ? 'https://tiles.openfreemap.org/styles/dark'
    : 'https://tiles.openfreemap.org/styles/liberty'
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
