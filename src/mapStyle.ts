import type maplibregl from 'maplibre-gl'

export type ThemeMode = 'light' | 'dark'

/** OpenFreeMap-Stile: helle Karte am Tag, dunkle bei Dark Mode (blendet nachts nicht). */
export function mapStyleUrl(theme: ThemeMode): string {
  return theme === 'dark'
    ? 'https://tiles.openfreemap.org/styles/dark'
    : 'https://tiles.openfreemap.org/styles/liberty'
}

/** Farbe der Etappenlinie — Transit-Farbe muss auf dunkler Karte sichtbar bleiben. */
export function routeColors(theme: ThemeMode) {
  return {
    bike: '#ec3013',
    walk: theme === 'dark' ? '#b9b5b5' : '#9b9797',
    transit: theme === 'dark' ? '#f3f2f2' : '#201e1d',
    casing: theme === 'dark' ? '#000000' : '#0e1116',
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
