import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { getGeolocation, reverseGeocode } from '../api'
import { CloseIcon, PinIcon, TargetIcon } from '../icons'
import { mapStyleUrl, stilAbsichern } from '../mapStyle'
import { stadt } from '../stadt'
import type { StilWache, ThemeMode } from '../mapStyle'
import type { LatLon, Place } from '../types'
import { useBackGuard } from '../hooks/useBackGuard'
import { t } from '../i18n'
import type { Language } from '../i18n'
import { kachelpufferEinrichten, kartenAnfrage } from '../kachelpuffer'
import { kartenArbeiterEinrichten } from '../kartenarbeiter'
import MapOutage from './MapOutage'

interface Props {
  /** Kurze Bezeichnung über dem Namen: „Startpunkt" oder „Zielpunkt". */
  title: string
  initial?: LatLon | null
  /** Bekannter Standort aus der App — spart das erneute Fragen. */
  userPos?: LatLon | null
  theme?: ThemeMode
  lang?: Language
  onPick: (p: Place) => void
  onClose: () => void
}

/**
 * Zurück-Geste/Zurück-Taste schließt diese Ansicht.
 *
 * Zwei Fehler steckten hier: Der Effekt hing an `onClose`, das in App.tsx als
 * Inline-Funktion übergeben wird — bei jedem Rerender (die Uhr tickt alle
 * 30 s) lief er erneut und schob einen weiteren History-Eintrag nach. Nach
 * fünf Minuten brauchte es zehn Drücke auf „Zurück", bis etwas passierte.
 * Und beim Schließen über X oder Auswahl blieb der Eintrag liegen, sodass der
 * nächste Zurück-Druck ins Leere ging.
 */

export default function MapPicker({
  title,
  initial,
  userPos = null,
  theme = 'light',
  lang = 'de',
  onPick,
  onClose,
}: Props) {
  const canvas = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const nameTimer = useRef<number | undefined>(undefined)
  const nameCtrl = useRef<AbortController | null>(null)
  const meMarker = useRef<maplibregl.Marker | null>(null)
  const [name, setName] = useState('…')
  const [stilWeg, setStilWeg] = useState(false)
  const wache = useRef<StilWache | null>(null)
  /** Selbst ermittelter Standort, falls die App keinen mitgibt. */
  const [ownPos, setOwnPos] = useState<LatLon | null>(null)
  const hier = userPos ?? ownPos

  useBackGuard(true, onClose)

  // Ohne Vorgabe stand die Karte auf dem Marienplatz — von dort aus muss man
  // erst quer durch die Stadt schieben. Sinnvoller Anfang ist der eigene Ort.
  useEffect(() => {
    if (userPos) return
    let lebt = true
    getGeolocation()
      .then(p => lebt && setOwnPos(p))
      .catch(() => {})
    return () => {
      lebt = false
    }
  }, [userPos])

  useEffect(() => {
    if (!canvas.current || map.current) return
    kartenArbeiterEinrichten()
    kachelpufferEinrichten(maplibregl.addProtocol)
    const m = new maplibregl.Map({
      container: canvas.current,
      style: mapStyleUrl(theme),
      center: initial
        ? [initial.lon, initial.lat]
        : hier
          ? [hier.lon, hier.lat]
          : [stadt().mitte.lon, stadt().mitte.lat],
      zoom: initial || hier ? 15 : 12,
      attributionControl: { compact: true },
      transformRequest: kartenAnfrage,
    })
    map.current = m
    const update = () => {
      const c = m.getCenter()
      window.clearTimeout(nameTimer.current)
      // Laufende Abfrage abbrechen. Ohne das gewann die zuletzt *eintreffende*
      // Antwort, nicht die zuletzt *gestellte*: eine langsame Antwort für den
      // alten Punkt überschrieb den Namen des neuen, und „Übernehmen" lieferte
      // dann fremde Koordinaten zum angezeigten Namen.
      nameCtrl.current?.abort()
      setName('…')
      nameTimer.current = window.setTimeout(async () => {
        const ctrl = new AbortController()
        nameCtrl.current = ctrl
        try {
          const n = await reverseGeocode(c.lat, c.lng, ctrl.signal)
          if (!ctrl.signal.aborted) setName(n ?? t('mapPoint', lang))
        } catch (e) {
          if ((e as Error)?.name !== 'AbortError') setName(t('mapPoint', lang))
        }
      }, 350)
    }
    m.on('load', update)
    m.on('moveend', update)
    wache.current = stilAbsichern(m, () => mapStyleUrl(theme), {
      nachStil: update,
      beiZustand: setStilWeg,
    })
    return () => {
      window.clearTimeout(nameTimer.current)
      nameCtrl.current?.abort()
      m.remove()
      map.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m || !hier) return
    if (!meMarker.current) {
      const el = document.createElement('div')
      el.className = 'mk-user'
      meMarker.current = new maplibregl.Marker({ element: el }).setLngLat([hier.lon, hier.lat]).addTo(m)
      // Kam der Standort erst nach dem Aufbau der Karte und gab es keine
      // Vorgabe, steht die Karte noch auf der Stadtmitte — dann nachziehen.
      // Ohne Animation: das erste Zurechtrücken ist kein Vorgang, den man
      // sehen will, und eine gedrosselte Animation käme nie an.
      if (!initial) m.jumpTo({ center: [hier.lon, hier.lat], zoom: 15 })
    } else {
      meMarker.current.setLngLat([hier.lon, hier.lat])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hier])

  function confirm() {
    const m = map.current
    if (!m) return
    const c = m.getCenter()
    onPick({ name: name && name !== '…' ? name : t('mapPoint', lang), lat: c.lat, lon: c.lng })
  }

  return (
    <div className="picker">
      <div className="picker-top floating">
        <div className="pk-head-card">
          <span className="pk-head-icon">
            <PinIcon size={18} />
          </span>
          <div className="pk-head-main">
            <div className="pk-kicker">{title}</div>
            <div className="pk-target">{name === '…' ? t('mapPoint', lang) : name}</div>
          </div>
        </div>
        <button className="picker-x" onClick={onClose} aria-label={t('bmBack', lang)} title={t('bmBack', lang)}>
          <CloseIcon size={16} />
        </button>
      </div>
      <div className="picker-map">
        {stilWeg && <MapOutage lang={lang} onRetry={() => wache.current?.erneutVersuchen()} />}
        <div ref={canvas} className="picker-canvas" />
        <div className="picker-pin" />
        {hier && (
          <button
            className="bm-locate"
            aria-label={t('bmLocateTitle', lang)}
            title={t('bmLocateTitle', lang)}
            onClick={() => map.current?.easeTo({ center: [hier.lon, hier.lat], zoom: 16 })}
          >
            <TargetIcon size={18} />
          </button>
        )}
      </div>
      <div className="picker-bottom">
        <button className="btn-block" onClick={confirm}>
          {t('confirm', lang)}
        </button>
      </div>
    </div>
  )
}
