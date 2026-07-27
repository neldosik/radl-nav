import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { getGeolocation, reverseGeocode } from '../api'
import { CloseIcon, TargetIcon } from '../icons'
import { mapStyleUrl } from '../mapStyle'
import type { ThemeMode } from '../mapStyle'
import type { LatLon, Place } from '../types'
import { t } from '../i18n'
import type { Language } from '../i18n'

interface Props {
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
/** Ein von uns selbst ausgelöster Rücksprung — das folgende popstate gehört
 *  nicht dem Nutzer. Modulübergreifend, weil Ansicht A beim Schließen den
 *  Rücksprung auslöst und Ansicht B ihn sonst als Zurück-Druck missversteht. */
let eigenerRuecksprung = false

function useBackToClose(onClose: () => void) {
  const schliessen = useRef(onClose)
  schliessen.current = onClose
  /** Haben wir den Eintrag schon zurückgenommen? */
  const konsumiert = useRef(false)

  useEffect(() => {
    window.history.pushState({ radlOverlay: true }, '')
    const onPop = () => {
      // Unseren eigenen Rücksprung nicht als Zurück-Druck des Nutzers werten.
      // `history.back()` wirkt verzögert: im Entwicklungsmodus ruft React jeden
      // Effekt doppelt auf, dann fing der *neu* angemeldete Zuhörer das eigene
      // popstate ab und schloss die Ansicht sofort wieder.
      if (eigenerRuecksprung) {
        eigenerRuecksprung = false
        return
      }
      konsumiert.current = true
      schliessen.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // Regulär geschlossen (X, Auswahl, Reiterwechsel): eigenen Eintrag
      // zurücknehmen, sonst verpufft der nächste Zurück-Druck.
      if (!konsumiert.current) {
        eigenerRuecksprung = true
        window.history.back()
      }
    }
  }, [])
}

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
  /** Selbst ermittelter Standort, falls die App keinen mitgibt. */
  const [ownPos, setOwnPos] = useState<LatLon | null>(null)
  const hier = userPos ?? ownPos

  useBackToClose(onClose)

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
    const m = new maplibregl.Map({
      container: canvas.current,
      style: mapStyleUrl(theme),
      center: initial
        ? [initial.lon, initial.lat]
        : hier
          ? [hier.lon, hier.lat]
          : [11.575, 48.137],
      zoom: initial || hier ? 15 : 12,
      attributionControl: { compact: true },
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
      <div className="picker-top">
        <span>{title}</span>
        <button className="picker-x" onClick={onClose} aria-label={t('bmBack', lang)} title={t('bmBack', lang)}>
          <CloseIcon size={16} />
        </button>
      </div>
      <div className="picker-map">
        <div ref={canvas} className="picker-canvas" />
        <div className="picker-pin" />
        <div className="picker-hint">{t('moveMapHint', lang)}</div>
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
        <div className="picker-name">{name}</div>
        <button className="btn-block" onClick={confirm}>
          {t('confirm', lang)}
        </button>
      </div>
    </div>
  )
}
