import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { reverseGeocode } from '../api'
import { CloseIcon } from '../icons'
import { mapStyleUrl } from '../mapStyle'
import type { ThemeMode } from '../mapStyle'
import type { LatLon, Place } from '../types'
import { t } from '../i18n'
import type { Language } from '../i18n'

interface Props {
  title: string
  initial?: LatLon | null
  theme?: ThemeMode
  lang?: Language
  onPick: (p: Place) => void
  onClose: () => void
}

export default function MapPicker({ title, initial, theme = 'light', lang = 'de', onPick, onClose }: Props) {
  const canvas = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const nameTimer = useRef<number | undefined>(undefined)
  const touchStartX = useRef<number | null>(null)
  const [name, setName] = useState('…')

  // Geste: Zurück per Android/iOS Zurück-Button
  useEffect(() => {
    window.history.pushState({ pickerOpen: true }, '')
    const handlePopState = () => {
      onClose()
    }
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [onClose])

  useEffect(() => {
    if (!canvas.current || map.current) return
    const m = new maplibregl.Map({
      container: canvas.current,
      style: mapStyleUrl(theme),
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
        setName(await reverseGeocode(c.lat, c.lng).catch(() => t('mapPoint', lang)))
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

  function confirm() {
    const m = map.current
    if (!m) return
    const c = m.getCenter()
    onPick({ name: name && name !== '…' ? name : t('mapPoint', lang), lat: c.lat, lon: c.lng })
  }

  return (
    <div className="picker" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="picker-top">
        <span>{title}</span>
        <button className="picker-x" onClick={onClose}>
          <CloseIcon size={14} /> {t('bmBack', lang)}
        </button>
      </div>
      <div className="picker-map">
        <div ref={canvas} className="picker-canvas" />
        <div className="picker-pin" />
        <div className="picker-hint">{t('moveMapHint', lang)}</div>
      </div>
      <div className="picker-bottom">
        <div className="picker-name">{name}</div>
        <button className="btn-block" onClick={confirm}>
          {t('confirm', lang)}
        </button>
      </div>
    </div>
  )
}
