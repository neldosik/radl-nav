import { useEffect, useRef, useState } from 'react'
import { haversine } from '../geo'
import { legTarget } from '../routing'
import type { ItineraryView, LatLon } from '../types'
import { useWakeLock } from './useWakeLock'

/** Abstand zum Etappenende, ab dem automatisch weitergeschaltet wird. */
const ARRIVE_RADIUS_M = 70
/** Fixes mit schlechterer Genauigkeit sind für 70-m-Entscheidungen unbrauchbar. */
const MAX_ACCURACY_M = 100
/** Unter dieser Bewegung ist es GPS-Rauschen — kein neuer Zustand, kein Rerender. */
const MIN_MOVE_M = 3

export interface UserPos extends LatLon {
  /** Genauigkeit des Fixes in Metern (falls das Gerät sie liefert). */
  accuracy?: number
}

export interface Journey {
  /** null = Navigation aus, sonst Index der aktuellen Etappe */
  legIndex: number | null
  startedAt: number | null
  arrived: boolean
  userPos: UserPos | null
  /** Luftlinie zum Etappenziel, sobald GPS vorhanden */
  distToEnd: number | null
  start: () => void
  exit: () => void
  goTo: (i: number) => void
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
  const active = legIndex != null
  const viewRef = useRef(view)
  viewRef.current = view

  useWakeLock(active && !arrived)

  // GPS verfolgen, solange navigiert wird.
  useEffect(() => {
    if (!active) {
      setUserPos(null)
      return
    }
    if (!navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      p => {
        const acc = p.coords.accuracy
        // Ausreißer verwerfen: ein 500-m-Fix schaltet sonst Etappen weiter
        // und lässt die Karte springen.
        if (acc != null && acc > MAX_ACCURACY_M) return
        const next = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: acc }
        setUserPos(prev => (prev && haversine(prev, next) < MIN_MOVE_M ? prev : next))
      },
      () => {},
      // maximumAge 0: im Fahrbetrieb ist ein drei Sekunden alter Fix wertlos.
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [active])

  // Etappenziel erreicht (< 70 m) → nächste Etappe, mit kurzer Vibration.
  useEffect(() => {
    const v = viewRef.current
    if (legIndex == null || !userPos || !v) return
    const target = legTarget(v, legIndex)
    if (!target) return
    const d = haversine(userPos, target)
    if (d < ARRIVE_RADIUS_M && legIndex < v.it.legs.length - 1) {
      setLegIndex(legIndex + 1)
      navigator.vibrate?.(200)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPos])

  const target = legIndex != null && view ? legTarget(view, legIndex) : null
  const distToEnd = target && userPos ? haversine(userPos, target) : null

  return {
    legIndex,
    startedAt,
    arrived,
    userPos,
    distToEnd,
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
    goTo: (i: number) => setLegIndex(i),
    markArrived: () => setArrived(true),
    setUserPos,
  }
}
