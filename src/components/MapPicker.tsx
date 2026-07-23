import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { reverseGeocode } from '../api'
import { CloseIcon } from '../icons'
import type { LatLon, Place } from '../types'

const STYLE = 'https://tiles.openfreemap.org/styles/liberty'

interface Props {
  title: string
  initial?: LatLon | null
  onPick: (p: Place) => void
  onClose: () => void
}

export default function MapPicker({ title, initial, onPick, onClose }: Props) {
  const canvas = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const nameTimer = useRef<number | undefined>(undefined)
  const [name, setName] = useState('…')

  useEffect(() => {
    if (!canvas.current || map.current) return
    const m = new maplibregl.Map({
      container: canvas.current,
      style: STYLE,
      center: initial ? [initial.lon, initial.lat] : [11.575, 48.137],
      zoom: initial ? 15 : 12,
      attributionControl: { compact: true },
    })
    map.current = m
    const update = () => {
      const c = m.getCenter()
      window.clearTimeout(nameTimer.current)
      setName('…')
      nameTimer.current = window.setTimeout(async () => {
        setName(await reverseGeocode(c.lat, c.lng).catch(() => 'Kartenpunkt'))
      }, 350)
    }
    m.on('load', update)
    m.on('moveend', update)
    return () => {
      m.remove()
      map.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function confirm() {
    const m = map.current
    if (!m) return
    const c = m.getCenter()
    onPick({ name: name && name !== '…' ? name : 'Kartenpunkt', lat: c.lat, lon: c.lng })
  }

  return (
    <div className="picker">
      <div className="picker-top">
        <span>{title}</span>
        <button className="picker-x" onClick={onClose}>
          <CloseIcon size={14} /> ZURÜCK
        </button>
      </div>
      <div className="picker-map">
        <div ref={canvas} className="picker-canvas" />
        <div className="picker-pin" />
        <div className="picker-hint">Karte verschieben — Pin zeigt dein Ziel</div>
      </div>
      <div className="picker-bottom">
        <div className="picker-name">{name}</div>
        <button className="btn-block" onClick={confirm}>
          Übernehmen
        </button>
      </div>
    </div>
  )
}
