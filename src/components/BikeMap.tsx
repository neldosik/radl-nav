import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { loadFreeBikes, loadStations } from '../api'
import { clusterFreeBikes, nearbyStations } from '../geo'
import { CloseIcon, TargetIcon } from '../icons'
import { mapStyleUrl } from '../mapStyle'
import type { ThemeMode } from '../mapStyle'
import type { LatLon, Place, Station } from '../types'

interface Props {
  userPos: LatLon | null
  theme?: ThemeMode
  /** Station als Startpunkt übernehmen */
  onPick: (p: Place) => void
  onClose: () => void
}

const MUNICH: LatLon = { lat: 48.137, lon: 11.575 }
/** Umkreis, in dem Räder gesucht werden. */
const RADIUS_M = 1500

/**
 * Vollbildkarte „Räder in der Nähe" — zeigt ohne Routenplanung, wo gerade
 * Räder stehen (Stationen und freistehende Räder), inklusive E-Bike-Anzahl.
 */
export default function BikeMap({ userPos, theme = 'light', onPick, onClose }: Props) {
  const canvas = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  const [supply, setSupply] = useState<Station[] | null>(null)
  const [selected, setSelected] = useState<Station | null>(null)
  const center = userPos ?? MUNICH

  // Stationen und freistehende Räder laden
  useEffect(() => {
    let alive = true
    Promise.all([loadStations(), loadFreeBikes()])
      .then(([st, free]) => {
        if (alive) setSupply([...st, ...clusterFreeBikes(free)])
      })
      .catch(() => alive && setSupply([]))
    return () => {
      alive = false
    }
  }, [])

  // Karte einmalig aufbauen
  useEffect(() => {
    if (!canvas.current || map.current) return
    const m = new maplibregl.Map({
      container: canvas.current,
      style: mapStyleUrl(theme),
      center: [center.lon, center.lat],
      zoom: 14.5,
      attributionControl: { compact: true },
    })
    map.current = m
    return () => {
      m.remove()
      map.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Marker zeichnen, sobald die Daten da sind
  useEffect(() => {
    const m = map.current
    if (!m || !supply) return
    markers.current.forEach(mk => mk.remove())
    markers.current = []

    for (const { station } of nearbyStations(center, supply, RADIUS_M, 60)) {
      const total = station.bikes + station.ebikes
      const el = document.createElement('div')
      el.className = `bm-pin${station.bikes === 0 ? ' only-e' : ''}`
      el.textContent = String(total)
      el.title = station.name
      el.onclick = () => setSelected(station)
      markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([station.lon, station.lat]).addTo(m))
    }

    if (userPos) {
      const me = document.createElement('div')
      me.className = 'mk-user'
      markers.current.push(new maplibregl.Marker({ element: me }).setLngLat([userPos.lon, userPos.lat]).addTo(m))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supply])

  const list = supply ? nearbyStations(center, supply, RADIUS_M, 60) : []
  const totalBikes = list.reduce((n, x) => n + x.station.bikes, 0)
  const totalE = list.reduce((n, x) => n + x.station.ebikes, 0)

  return (
    <div className="picker">
      <div className="picker-top">
        <span>Räder in der Nähe</span>
        <button className="picker-x" onClick={onClose}>
          <CloseIcon size={14} /> ZURÜCK
        </button>
      </div>

      <div className="picker-map">
        <div ref={canvas} className="picker-canvas" />
        <div className="picker-hint">
          {supply == null
            ? 'Lade Räder …'
            : `${totalBikes} Räder · ${totalE} E-Bikes im Umkreis von 1,5 km`}
        </div>
        <button
          className="bm-locate"
          title="Auf meinen Standort zentrieren"
          onClick={() => map.current?.easeTo({ center: [center.lon, center.lat], zoom: 15 })}
        >
          <TargetIcon size={18} />
        </button>
      </div>

      <div className="picker-bottom">
        {selected ? (
          <>
            <div className="picker-name">{selected.name}</div>
            <div className="bm-counts">
              {selected.bikes} Räder{selected.ebikes > 0 ? ` · ${selected.ebikes} E-Bikes` : ''}
            </div>
            <button
              className="btn-block"
              onClick={() => onPick({ name: selected.name, lat: selected.lat, lon: selected.lon })}
            >
              Als Start übernehmen
            </button>
          </>
        ) : (
          <div className="bm-empty">Tippe auf einen Punkt — Zahl = verfügbare Räder</div>
        )}
      </div>
    </div>
  )
}
