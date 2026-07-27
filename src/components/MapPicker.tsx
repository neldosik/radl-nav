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

export default function MapPicker({ title, initial, theme = 'light', lang = 'de', onPick, onClose }: Props) {
  const canvas = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const nameTimer = useRef<number | undefined>(undefined)
  const nameCtrl = useRef<AbortController | null>(null)
  const [name, setName] = useState('…')

  useBackToClose(onClose)

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
