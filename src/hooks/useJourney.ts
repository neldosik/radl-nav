import { useEffect, useRef, useState } from 'react'
import { haversine } from '../geo'
import { watchPosition } from '../geolocation'
import { legTarget } from '../routing'
import type { ItineraryView, LatLon } from '../types'
import { useWakeLock } from './useWakeLock'

/** Abstand zum Etappenende, ab dem automatisch weitergeschaltet wird. */
const ARRIVE_RADIUS_M = 70
/** Fixes mit schlechterer Genauigkeit sind für 70-m-Entscheidungen unbrauchbar. */
const MAX_ACCURACY_M = 100
/** Unter dieser Bewegung ist es GPS-Rauschen — kein neuer Zustand, kein Rerender. */
const MIN_MOVE_M = 3
/** Ab hier gilt der letzte Fix als veraltet und die Entfernung als geraten. */
const STALE_AFTER_MS = 30_000
/** So lange nach einem Handgriff bleibt die automatische Weiterschaltung aus. */
const MANUAL_HOLD_MS = 90_000

export interface UserPos extends LatLon {
  /** Genauigkeit des Fixes in Metern (falls das Gerät sie liefert). */
  accuracy?: number
  /** Wann der Fix eintraf — damit die Oberfläche eine eingefrorene Anzeige
   *  als solche kennzeichnen kann. */
  at: number
}

export interface Journey {
  /** null = Navigation aus, sonst Index der aktuellen Etappe */
  legIndex: number | null
  startedAt: number | null
  arrived: boolean
  userPos: UserPos | null
  /** Luftlinie zum Etappenziel, sobald GPS vorhanden */
  distToEnd: number | null
  /** Kein Standort: 'denied' = Freigabe fehlt, 'lost' = Signal weg (Tunnel). */
  gpsError: 'denied' | 'lost' | null
  /** Der letzte Fix ist älter als STALE_AFTER_MS — Entfernung ist geraten. */
  posStale: boolean
  start: () => void
  exit: () => void
  goTo: (i: number) => void
  /** Nach einer Neuberechnung weiterfahren: ohne Handgriff-Pause und ohne
   *  die Fahrzeit zurückzusetzen — die Fahrt läuft ja weiter. */
  continueOn: (i: number) => void
  markArrived: () => void
  setUserPos: (p: UserPos | null) => void
}

/**
 * Zustand des Los-Modus: Etappenindex, Fahrzeit, GPS-Verfolgung,
 * Bildschirm-Wachhalten und automatisches Weiterschalten am Etappenende.
 */
export function useJourney(view: ItineraryView | null): Journey {
  const [legIndex, setLegIndex] = useState<number | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [arrived, setArrived] = useState(false)
  const [userPos, setUserPos] = useState<UserPos | null>(null)
  const [gpsError, setGpsError] = useState<'denied' | 'lost' | null>(null)
  const active = legIndex != null
  const viewRef = useRef(view)
  viewRef.current = view
  /**
   * Nach einem Griff zu „Vorherige"/„Nächste" pausiert die automatische
   * Weiterschaltung.
   *
   * Ohne das war der Zurück-Knopf wirkungslos: wer zurückschaltete, stand
   * meist noch innerhalb der 70 m um das Ziel der vorherigen Etappe, und der
   * nächste GPS-Fix — also spätestens eine Sekunde später — schaltete sofort
   * wieder vor.
   */
  const manuellBis = useRef(0)

  useWakeLock(active && !arrived)

  // GPS verfolgen, solange navigiert wird — auf dem Ankunftsschirm nicht mehr.
  useEffect(() => {
    if (!active || arrived) {
      // Die letzte bekannte Position bleibt stehen: die Übersichtskarte zeigt
      // damit weiter, wo man ist. Vorher wurde sie geleert und erst beim
      // nächsten Start der Navigation wieder gefüllt.
      setGpsError(null)
      return
    }
    // Nativ über die App-Hülle (Play-Dienste, eigene Taktung, Blickrichtung),
    // im Web über den Browser — die Auswahl trifft `watchPosition`.
    const watch = watchPosition(
      f => {
        setGpsError(null)
        const acc = f.accuracy
        // Ausreißer verwerfen: ein 500-m-Fix schaltet sonst Etappen weiter
        // und lässt die Karte springen.
        if (acc != null && acc > MAX_ACCURACY_M) return
        const next = { lat: f.lat, lon: f.lon, accuracy: acc, at: f.at }
        // Nur die Koordinaten entscheiden über „hat sich bewegt"; der
        // Zeitstempel wird immer mitgeführt, sonst altert die Anzeige im Stand.
        setUserPos(prev =>
          prev && haversine(prev, next) < MIN_MOVE_M ? { ...prev, at: next.at } : next,
        )
      },
      // Vorher eine leere Funktion: fiel GPS aus, blieb die zuletzt bekannte
      // Entfernung stehen und wurde weiter als aktuell angezeigt.
      grund => setGpsError(grund),
    )
    return () => watch.stop()
  }, [active, arrived])

  // Etappenziel erreicht (< 70 m) → nächste Etappe, mit kurzer Vibration.
  useEffect(() => {
    const v = viewRef.current
    if (legIndex == null || !userPos || !v) return
    const target = legTarget(v, legIndex)
    if (!target) return
    const d = haversine(userPos, target)
    // Solange die Sperre läuft, entscheidet der Nutzer, nicht das GPS.
    if (Date.now() < manuellBis.current) return
    if (d < ARRIVE_RADIUS_M && legIndex < v.it.legs.length - 1) {
      setLegIndex(legIndex + 1)
      navigator.vibrate?.(200)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPos])

  const target = legIndex != null && view ? legTarget(view, legIndex) : null
  const distToEnd = target && userPos ? haversine(userPos, target) : null
  const posStale = !!userPos && Date.now() - userPos.at > STALE_AFTER_MS

  return {
    legIndex,
    startedAt,
    arrived,
    userPos,
    distToEnd,
    gpsError,
    posStale,
    start: () => {
      setLegIndex(0)
      setStartedAt(Date.now())
      setArrived(false)
    },
    exit: () => {
      setLegIndex(null)
      setStartedAt(null)
      setArrived(false)
    },
    goTo: (i: number) => {
      manuellBis.current = Date.now() + MANUAL_HOLD_MS
      setLegIndex(i)
    },
    continueOn: (i: number) => {
      manuellBis.current = 0
      setArrived(false)
      setLegIndex(i)
    },
    markArrived: () => setArrived(true),
    setUserPos,
  }
}
