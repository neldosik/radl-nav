import type { LatLon } from './types'
import { haversine } from './geo'

/**
 * Der tatsächlich gefahrene Weg — aufgezeichnet, nicht der geplante.
 *
 * Roh sind das rund 1800 Punkte je halbe Stunde. Ungefiltert wäre das nicht
 * nur zu viel Speicher, sondern auch falsch: im Stand wandert der Standort
 * durch das Rauschen weiter und zieht eine Strecke nach, die nie gefahren
 * wurde. Deshalb kommt ein Punkt nur dazu, wenn er weit genug vom letzten
 * entfernt ist, und am Ende wird die Linie ausgedünnt.
 */

/** Näher als das gilt als Rauschen im Stand, nicht als Bewegung. */
export const MIN_SCHRITT_M = 8
/** Abweichung, die beim Ausdünnen verworfen werden darf. */
export const AUSDUENN_M = 10

export function punktAnhaengen(spur: LatLon[], p: LatLon): LatLon[] {
  const letzter = spur[spur.length - 1]
  if (letzter && haversine(letzter, p) < MIN_SCHRITT_M) return spur
  return [...spur, { lat: p.lat, lon: p.lon }]
}

/** Abstand eines Punktes zur Geraden durch zwei andere, in Metern. */
function abstandZurGeraden(p: LatLon, a: LatLon, b: LatLon): number {
  const ab = haversine(a, b)
  if (ab < 1e-6) return haversine(p, a)
  // Ebene Näherung: über wenige hundert Meter ist die Krümmung unerheblich.
  const mx = Math.cos((a.lat * Math.PI) / 180)
  const ax = a.lon * mx, ay = a.lat
  const bx = b.lon * mx, by = b.lat
  const px = p.lon * mx, py = p.lat
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  const fx = ax + t * dx, fy = ay + t * dy
  return haversine(p, { lat: fy, lon: fx / mx })
}

/** Linie ausdünnen (Douglas–Peucker), ohne ihre Form zu verlieren. */
export function ausduennen(spur: LatLon[], toleranzM = AUSDUENN_M): LatLon[] {
  if (spur.length <= 2) return [...spur]
  let maxD = 0
  let idx = 0
  for (let i = 1; i < spur.length - 1; i++) {
    const d = abstandZurGeraden(spur[i], spur[0], spur[spur.length - 1])
    if (d > maxD) { maxD = d; idx = i }
  }
  if (maxD <= toleranzM) return [spur[0], spur[spur.length - 1]]
  const links = ausduennen(spur.slice(0, idx + 1), toleranzM)
  const rechts = ausduennen(spur.slice(idx), toleranzM)
  return [...links.slice(0, -1), ...rechts]
}
