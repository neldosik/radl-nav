import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { decodePolyline } from '../polyline'
import { modeMeta } from '../format'
import type { ItineraryView } from '../types'

interface Props {
  view: ItineraryView | null
}

const STYLE = 'https://tiles.openfreemap.org/styles/liberty'

export default function MapView({ view }: Props) {
  const div = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  const ready = useRef(false)
  const viewRef = useRef<ItineraryView | null>(null)

  function clear() {
    const m = map.current
    if (!m) return
    ;(m.getSource('route') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: [],
    })
    markers.current.forEach(mk => mk.remove())
    markers.current = []
  }

  function draw(v: ItineraryView) {
    const m = map.current
    if (!m) return

    const features = v.it.legs.map(leg => {
      const meta = modeMeta(leg)
      const coords: [number, number][] = leg.legGeometry?.points
        ? decodePolyline(leg.legGeometry.points, leg.legGeometry.precision ?? 6)
        : [
            [leg.from.lon, leg.from.lat],
            [leg.to.lon, leg.to.lat],
          ]
      return {
        type: 'Feature' as const,
        properties: { color: meta.color, dash: leg.mode === 'WALK' },
        geometry: { type: 'LineString' as const, coordinates: coords },
      }
    })
    ;(m.getSource('route') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features,
    })

    markers.current.forEach(mk => mk.remove())
    markers.current = []
    const add = (lon: number, lat: number, html: string, cls: string) => {
      const el = document.createElement('div')
      el.className = `mk ${cls}`
      el.innerHTML = html
      markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(m))
    }
    const legs = v.it.legs
    add(legs[0].from.lon, legs[0].from.lat, 'A', 'mk-a')
    add(legs[legs.length - 1].to.lon, legs[legs.length - 1].to.lat, 'B', 'mk-b')
    for (const [i, info] of v.bikeLegs) {
      const leg = legs[i]
      if (info.startStation) add(leg.from.lon, leg.from.lat, `🚲${info.startStation.bikes}`, 'mk-bike')
      if (info.endStation) add(leg.to.lon, leg.to.lat, '🅿', 'mk-bike')
    }

    const bounds = new maplibregl.LngLatBounds()
    for (const f of features) for (const c of f.geometry.coordinates) bounds.extend(c)
    if (!bounds.isEmpty()) m.fitBounds(bounds, { padding: 60, maxZoom: 15.5, duration: 500 })
  }

  useEffect(() => {
    if (!div.current || map.current) return
    const m = new maplibregl.Map({
      container: div.current,
      style: STYLE,
      center: [11.575, 48.137],
      zoom: 11.5,
      attributionControl: { compact: true },
    })
    m.on('load', () => {
      m.addSource('route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      m.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route',
        paint: { 'line-color': '#0e1116', 'line-width': 7, 'line-opacity': 0.85 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })
      m.addLayer({
        id: 'route-solid',
        type: 'line',
        source: 'route',
        filter: ['!', ['get', 'dash']],
        paint: { 'line-color': ['get', 'color'], 'line-width': 4.5 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })
      m.addLayer({
        id: 'route-dash',
        type: 'line',
        source: 'route',
        filter: ['get', 'dash'],
        paint: { 'line-color': ['get', 'color'], 'line-width': 3.5, 'line-dasharray': [0.5, 1.6] },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })
      ready.current = true
      if (viewRef.current) draw(viewRef.current)
    })
    map.current = m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    viewRef.current = view
    if (!ready.current) return
    if (view) draw(view)
    else clear()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  return <div ref={div} className="map" />
}
