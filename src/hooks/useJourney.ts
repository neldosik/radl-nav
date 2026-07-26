import { useEffect, useRef, useState } from 'react'
import { haversine } from '../geo'
import type { ItineraryView, LatLon } from '../types'

/** Abstand zum Etappenende, ab dem automatisch weitergeschaltet wird. */
const ARRIVE_RADIUS_M = 70

export interface Journey {
  /** null = Navigation aus, sonst Index der aktuellen Etappe */
  legIndex: number | null
  startedAt: number | null
  arrived: boolean
  userPos: LatLon | null
  /** Luftlinie zum Etappenende, sobald GPS vorhanden */
  distToEnd: number | null
  start: () => void
  exit: () => void
  goTo: (i: number) => void
  markArrived: () => void
  setUserPos: (p: LatLon | null) => void
}

/**
 * Zustand des Los-Modus: Etappenindex, Fahrzeit, GPS-Verfolgung,
 * Bildschirm-Wachhalten und automatisches Weiterschalten am Etappenende.
 */
export function useJourney(view: ItineraryView | null): Journey {
  const [legIndex, setLegIndex] = useState<number | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [arrived, setArrived] = useState(false)
  const [userPos, setUserPos] = useState<LatLon | null>(null)
  const active = legIndex != null
  const viewRef = useRef(view)
  viewRef.current = view

  // GPS verfolgen und Display anlassen, solange navigiert wird.
  useEffect(() => {
    if (!active) {
      setUserPos(null)
      return
    }
    if (!navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      p => setUserPos({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
    )
    let lock: WakeLockSentinel | undefined
    navigator.wakeLock
      ?.request('screen')
      .then(l => {
        lock = l
      })
      .catch(() => {})
    return () => {
      navigator.geolocation.clearWatch(id)
      lock?.release().catch(() => {})
    }
  }, [active])

  // Etappenende erreicht (< 70 m) → nächste Etappe, mit kurzer Vibration.
  useEffect(() => {
    const v = viewRef.current
    if (legIndex == null || !userPos || !v) return
    const legs = v.it.legs
    const leg = legs[legIndex]
    if (!leg) return
    const d = haversine(userPos, { lat: leg.to.lat, lon: leg.to.lon })
    if (d < ARRIVE_RADIUS_M && legIndex < legs.length - 1) {
      setLegIndex(legIndex + 1)
      navigator.vibrate?.(200)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPos])

  const leg = legIndex != null && view ? view.it.legs[legIndex] : null
  const distToEnd =
    leg && userPos ? haversine(userPos, { lat: leg.to.lat, lon: leg.to.lon }) : null

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
