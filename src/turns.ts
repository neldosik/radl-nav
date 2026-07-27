import { haversine } from './geo'
import type { LatLon } from './types'

/**
 * Abbiegehinweise aus der Etappenlinie.
 *
 * Transitous liefert zwar ein `steps`-Feld mit `relativeDirection`, in der
 * Praxis steht dort aber fast immer `CONTINUE`: nachgezählt 1328 von 1421
 * Schritten über drei Anfragen, kein einziges LEFT oder RIGHT, und nur 12 %
 * der Schritte tragen einen Straßennamen. Die Hinweise entstehen deshalb hier
 * aus der Geometrie — aus der Änderung der Fahrtrichtung von Segment zu
 * Segment.
 */

export type TurnKind = 'left' | 'right' | 'slight-left' | 'slight-right' | 'sharp-left' | 'sharp-right'

export interface Turn {
  /** Stützpunkt der Linie, an dem abgebogen wird */
  index: number
  /** Weg vom Etappenanfang bis zum Abbiegepunkt, in Metern */
  at: number
  kind: TurnKind
  /** Richtungsänderung in Grad, positiv = rechts */
  angle: number
}

/** Ab dieser Richtungsänderung gilt es als Abbiegen und nicht als Straßenbogen. */
const MIN_TURN_DEG = 35
const SHARP_DEG = 110
const SLIGHT_DEG = 60
/** Zu kurze Segmente zappeln — sie taugen nicht als Richtungsgeber. */
const MIN_SEGMENT_M = 12
/** Zwei Abbiegungen dichter beieinander sind dieselbe Kurve. */
const MERGE_WITHIN_M = 25

/** Kurswinkel von a nach b, 0° = Norden, im Uhrzeigersinn. */
export function bearing(a: LatLon, b: LatLon): number {
  const toRad = Math.PI / 180
  const φ1 = a.lat * toRad
  const φ2 = b.lat * toRad
  const Δλ = (b.lon - a.lon) * toRad
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (Math.atan2(y, x) * 180) / Math.PI
}

/** Differenz zweier Kurswinkel, normiert auf −180…180. Positiv = nach rechts. */
export function angleDiff(from: number, to: number): number {
  let d = ((to - from + 540) % 360) - 180
  // −180 und 180 sind derselbe Wendepunkt; auf +180 vereinheitlichen
  if (d === -180) d = 180
  return d
}

function kindOf(angle: number): TurnKind {
  const rechts = angle > 0
  const a = Math.abs(angle)
  if (a >= SHARP_DEG) return rechts ? 'sharp-right' : 'sharp-left'
  if (a < SLIGHT_DEG) return rechts ? 'slight-right' : 'slight-left'
  return rechts ? 'right' : 'left'
}

/**
 * Abbiegepunkte einer Linie.
 *
 * Kurze Segmente werden übersprungen, damit ein zappelnder Straßenverlauf
 * keine Geisterabbiegung erzeugt; dicht beieinander liegende Punkte gelten
 * als eine Kurve.
 */
export function turnsFromPath(path: LatLon[]): Turn[] {
  if (!path || path.length < 3) return []

  // Aufsummierte Länge bis zu jedem Stützpunkt
  const cum: number[] = [0]
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversine(path[i - 1], path[i]))

  const turns: Turn[] = []
  // Richtung des zuletzt *belastbaren* Segments merken
  let vorherIdx = 0
  let vorherKurs: number | null = null

  for (let i = 1; i < path.length; i++) {
    const laenge = cum[i] - cum[vorherIdx]
    if (laenge < MIN_SEGMENT_M && i < path.length - 1) continue

    const kurs = bearing(path[vorherIdx], path[i])
    if (vorherKurs != null) {
      const diff = angleDiff(vorherKurs, kurs)
      if (Math.abs(diff) >= MIN_TURN_DEG) {
        const letzter = turns[turns.length - 1]
        if (letzter && cum[vorherIdx] - letzter.at <= MERGE_WITHIN_M) {
          // Dieselbe Kurve — den stärkeren Winkel behalten
          if (Math.abs(diff) > Math.abs(letzter.angle)) {
            letzter.angle = diff
            letzter.kind = kindOf(diff)
          }
        } else {
          turns.push({ index: vorherIdx, at: cum[vorherIdx], kind: kindOf(diff), angle: diff })
        }
      }
    }
    vorherKurs = kurs
    vorherIdx = i
  }

  return turns
}

export interface NextTurn extends Turn {
  /** Entfernung vom aktuellen Standort bis zum Abbiegepunkt, in Metern */
  inM: number
}

/**
 * Die nächste Abbiegung vor einem, gemessen am zurückgelegten Weg.
 *
 * `entlang` ist der bereits zurückgelegte Anteil der Linie in Metern — den
 * liefert `projectOnPath`.
 */
export function nextTurn(turns: Turn[], entlangM: number): NextTurn | null {
  for (const t of turns) {
    if (t.at > entlangM) return { ...t, inM: Math.round(t.at - entlangM) }
  }
  return null
}
