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
const RADIUS_M = 2500

function distMeters(a: LatLon, b: LatLon): number {
  const R = 6371000
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLon = (b.lon - a.lon) * Math.PI / 180
  const sa = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return Math.round(R * 2 * Math.atan2(Math.sqrt(sa), Math.sqrt(1 - sa)))
}

function generatePillBadgeCanvas(bikes: number, ebikes: number, selected: boolean, filterType: string): ImageData {
  const showE = ebikes > 0 && filterType !== 'classic'
  const showC = bikes > 0 && filterType !== 'ebike'

  const eStr = showE ? `⚡ ${ebikes}` : ''
  const cStr = showC ? `🚲 ${bikes}` : ''
  const text = showE && showC ? `${eStr}  |  ${cStr}` : showE ? eStr : cStr

  const dpr = 2
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  ctx.font = 'bold 13px system-ui, -apple-system, sans-serif'
  const textW = ctx.measureText(text).width
  const w = Math.max(54, Math.ceil(textW) + 22)
  const h = 32

  canvas.width = w * dpr
  canvas.height = h * dpr
  ctx.scale(dpr, dpr)

  // Shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.22)'
  ctx.shadowBlur = 6
  ctx.shadowOffsetY = 2

  // Rounded Pill
  ctx.beginPath()
  const r = 13
  const x = 3, y = 2, width = w - 6, height = h - 6
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()

  ctx.fillStyle = '#ffffff'
  ctx.fill()

  ctx.shadowColor = 'transparent'
  ctx.lineWidth = selected ? 3 : 2
  ctx.strokeStyle = selected ? '#ec3013' : '#312e81'
  ctx.stroke()

  // Text
  ctx.font = 'bold 12px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#1e1b4b'
  ctx.fillText(text, w / 2, h / 2 - 1)

  return ctx.getImageData(0, 0, w * dpr, h * dpr)
}

export default function BikeMap({ userPos, theme = 'light', onSelectPlace, onClose }: Props) {
  const canvas = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const userMarker = useRef<maplibregl.Marker | null>(null)
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

  // WebGL 60fps locked GeoJSON layer rendering with dynamic high-DPI canvas textures
  useEffect(() => {
    const m = map.current
    if (!m || !supply) return

    const filtered = nearbyStations(center, supply, RADIUS_M, 100).filter(({ station }) => {
      if (filterType === 'classic') return station.bikes > 0
      if (filterType === 'ebike') return station.ebikes > 0
      return station.bikes > 0 || station.ebikes > 0
    })

    const geojson = {
      type: 'FeatureCollection' as const,
      features: filtered.map(({ station }) => {
        const uniqueId = station.id ?? `${station.lat}_${station.lon}`
        const isSel = selected ? (selected.id ? selected.id === uniqueId : selected.lat === station.lat && selected.lon === station.lon) : false
        const iconId = `pill-${station.bikes}-${station.ebikes}-${filterType}-${isSel ? 'sel' : 'norm'}`

        if (!m.hasImage(iconId)) {
          const imgData = generatePillBadgeCanvas(station.bikes, station.ebikes, isSel, filterType)
          m.addImage(iconId, imgData, { pixelRatio: 2 })
        }

        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [station.lon, station.lat],
          },
          properties: {
            id: uniqueId,
            name: station.name,
            bikes: station.bikes,
            ebikes: station.ebikes,
            iconId: iconId,
          },
        }
      }),
    }

    const applyData = () => {
      const src = m.getSource('bikes-supply') as maplibregl.GeoJSONSource
      if (src) {
        src.setData(geojson)
      } else {
        m.addSource('bikes-supply', { type: 'geojson', data: geojson })

        m.addLayer({
          id: 'bikes-pill-symbols',
          type: 'symbol',
          source: 'bikes-supply',
          layout: {
            'icon-image': ['get', 'iconId'],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'icon-anchor': 'center',
          },
        })

        m.on('click', 'bikes-pill-symbols', e => {
          const f = e.features?.[0]
          if (f) {
            const stId = f.properties?.id
            const st = supply.find(s => (s.id && s.id === stId) || `${s.lat}_${s.lon}` === stId)
            if (st) setSelected(st)
          }
        })
        m.on('mouseenter', 'bikes-pill-symbols', () => {
          m.getCanvas().style.cursor = 'pointer'
        })
        m.on('mouseleave', 'bikes-pill-symbols', () => {
          m.getCanvas().style.cursor = ''
        })
      }
    }

    if (m.isStyleLoaded()) {
      applyData()
    } else {
      m.once('load', applyData)
    }

    if (userPos && !userMarker.current) {
      const me = document.createElement('div')
      me.className = 'mk-user'
      userMarker.current = new maplibregl.Marker({ element: me }).setLngLat([userPos.lon, userPos.lat]).addTo(m)
    }
  }, [supply, filterType, selected, center, userPos])

  const list = supply ? nearbyStations(center, supply, RADIUS_M, 100) : []
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
