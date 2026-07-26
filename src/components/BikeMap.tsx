import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { loadFreeBikes, loadStations } from '../api'
import { clusterFreeBikes, nearbyStations } from '../geo'
import { BikeIcon, BoltIcon, CloseIcon, TargetIcon } from '../icons'
import { mapStyleUrl } from '../mapStyle'
import type { ThemeMode } from '../mapStyle'
import type { LatLon, Place, Station } from '../types'

interface Props {
  userPos: LatLon | null
  theme?: ThemeMode
  /** Station als Startpunkt übernehmen */
  onSelectPlace: (p: Place) => void
  onClose: () => void
}

const MUNICH: LatLon = { lat: 48.137, lon: 11.575 }
const RADIUS_M = 2000

function distMeters(a: LatLon, b: LatLon): number {
  const R = 6371000
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLon = (b.lon - a.lon) * Math.PI / 180
  const sa = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return Math.round(R * 2 * Math.atan2(Math.sqrt(sa), Math.sqrt(1 - sa)))
}

export default function BikeMap({ userPos, theme = 'light', onSelectPlace, onClose }: Props) {
  const canvas = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  const touchStartX = useRef<number | null>(null)
  const [supply, setSupply] = useState<Station[] | null>(null)
  const [selected, setSelected] = useState<Station | null>(null)
  const [filterType, setFilterType] = useState<'all' | 'classic' | 'ebike'>('all')
  const center = userPos ?? MUNICH

  // Geste / Zurück-Taste zum Schließen
  useEffect(() => {
    window.history.pushState({ bikemapOpen: true }, '')
    const handlePopState = () => {
      onClose()
    }
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [onClose])

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      touchStartX.current = e.touches[0].clientX
    }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current !== null && e.changedTouches.length === 1) {
      const deltaX = e.changedTouches[0].clientX - touchStartX.current
      if (deltaX > 80 && touchStartX.current < 80) {
        onClose()
      }
    }
    touchStartX.current = null
  }

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

  useEffect(() => {
    const m = map.current
    if (!m || !supply) return
    markers.current.forEach(mk => mk.remove())
    markers.current = []

    const filtered = nearbyStations(center, supply, RADIUS_M, 80).filter(({ station }) => {
      if (filterType === 'classic') return station.bikes > 0
      if (filterType === 'ebike') return station.ebikes > 0
      return station.bikes > 0 || station.ebikes > 0
    })

    for (const { station } of filtered) {
      const el = document.createElement('div')
      const isSel = selected?.name === station.name
      el.className = `bm-pill-marker${isSel ? ' selected' : ''}`
      el.title = station.name

      // Render Nextbike style pill marker layout (e.g. [⚡ 1 | 🚲 9] or [🚲 4])
      let html = ''
      if (station.ebikes > 0 && (filterType === 'all' || filterType === 'ebike')) {
        html += `<span class="bm-pill-sec ebike">⚡ ${station.ebikes}</span>`
      }
      if (station.ebikes > 0 && station.bikes > 0 && filterType === 'all') {
        html += `<span class="bm-pill-div"></span>`
      }
      if (station.bikes > 0 && (filterType === 'all' || filterType === 'classic')) {
        html += `<span class="bm-pill-sec classic">🚲 ${station.bikes}</span>`
      }

      el.innerHTML = html || `🚲 ${station.bikes + station.ebikes}`
      el.onclick = e => {
        e.stopPropagation()
        setSelected(station)
      }
      markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([station.lon, station.lat]).addTo(m))
    }

    if (userPos) {
      const me = document.createElement('div')
      me.className = 'mk-user'
      markers.current.push(new maplibregl.Marker({ element: me }).setLngLat([userPos.lon, userPos.lat]).addTo(m))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supply, filterType, selected])

  const list = supply ? nearbyStations(center, supply, RADIUS_M, 80) : []
  const totalBikes = list.reduce((n, x) => n + x.station.bikes, 0)
  const totalE = list.reduce((n, x) => n + x.station.ebikes, 0)
  const walkDistM = selected && userPos ? distMeters(userPos, { lat: selected.lat, lon: selected.lon }) : null

  return (
    <div className="picker" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
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
            : `${totalBikes} Standard-Räder · ${totalE} E-Bikes im Umkreis`}
        </div>

        <div className="bm-filter-bar">
          <button
            className={`bm-filter-chip${filterType === 'all' ? ' active' : ''}`}
            onClick={() => setFilterType('all')}
          >
            <BikeIcon size={14} /> Alle
          </button>
          <button
            className={`bm-filter-chip${filterType === 'classic' ? ' active' : ''}`}
            onClick={() => setFilterType('classic')}
          >
            <BikeIcon size={14} /> Fahrrad
          </button>
          <button
            className={`bm-filter-chip${filterType === 'ebike' ? ' active' : ''}`}
            onClick={() => setFilterType('ebike')}
          >
            <BoltIcon size={14} /> E-Bike
          </button>
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
            <div className="bm-counts-row">
              <span className="bm-count-pill classic">🚲 {selected.bikes} Standard</span>
              {selected.ebikes > 0 && <span className="bm-count-pill ebike">⚡ {selected.ebikes} E-Bike</span>}
              {walkDistM != null && (
                <span className="bm-walk-tag">🚶 {walkDistM} m · ~{Math.max(1, Math.ceil(walkDistM / 80))} Min. Fußweg</span>
              )}
            </div>
            <button
              className="btn-block"
              onClick={() => onSelectPlace({ name: selected.name, lat: selected.lat, lon: selected.lon })}
            >
              ✓ Als Start übernehmen
            </button>
          </>
        ) : (
          <div className="bm-empty">Tippe auf einen Pin — Details & Räder anzeigen</div>
        )}
      </div>
    </div>
  )
}
