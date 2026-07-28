import type { FreeBike, LatLon, Station } from './types'

/**
 * Freistehende Räder → Pseudo-Stationen: nahe beieinander stehende (Raster ~55m)
 * werden zusammengefasst, um Hunderte einzelne Pins auf der Karte zu vermeiden.
 */
export function clusterFreeBikes(bikes: FreeBike[]): Station[] {
  const grid = new Map<string, { lat: number; lon: number; n: number; bikes: number; ebikes: number; maxBat?: number; maxRange?: number }>()
  for (const b of bikes) {
    const key = `${Math.round(b.lat / 0.0005)}|${Math.round(b.lon / 0.0008)}`
    let g = grid.get(key)
    if (!g) {
      g = { lat: 0, lon: 0, n: 0, bikes: 0, ebikes: 0 }
      grid.set(key, g)
    }
    g.lat += b.lat
    g.lon += b.lon
    g.n++
    if (b.electric) {
      g.ebikes++
      if (b.batteryPercent != null && (g.maxBat == null || b.batteryPercent > g.maxBat)) {
        g.maxBat = b.batteryPercent
      }
      if (b.rangeKm != null && (g.maxRange == null || b.rangeKm > g.maxRange)) {
        g.maxRange = b.rangeKm
      }
    } else {
      g.bikes++
    }
  }
  return [...grid.entries()].map(([key, g]) => ({
    id: `free-${key}`,
    name: g.n === 1 ? 'Freies Rad' : 'Freie Räder',
    lat: g.lat / g.n,
    lon: g.lon / g.n,
    bikes: g.bikes,
    ebikes: g.ebikes,
    docks: null,
    maxChargePercent: g.maxBat,
    rangeKm: g.maxRange,
  }))
}

export function haversine(a: LatLon, b: LatLon): number {
  const R = 6371000
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export interface NearStation {
  station: Station
  dist: number
}

/** Nächstgelegene Stationen um einen Punkt (aufsteigend nach Entfernung). */
export function nearbyStations(
  p: LatLon,
  stations: Station[],
  maxDist = 600,
  limit = 6,
): NearStation[] {
  return stations
    .map(s => ({ station: s, dist: haversine(p, s) }))
    .filter(n => n.dist <= maxDist && (n.station.bikes > 0 || n.station.ebikes > 0))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit)
}

export interface Pickup extends NearStation {
  take: number
}

/**
 * Wie man `need` Räder des gewünschten Typs in der Nähe holt (gierig von nächstgelegenen Stationen).
 * Liefert Abholplan pro Station und Gesamtzahl verfügbarer Räder.
 */
export function planPickup(
  nearby: NearStation[],
  wantElectric: boolean,
  need: number,
): { picks: Pickup[]; got: number; totalElectric: number; totalClassic: number } {
  let left = need
  const picks: Pickup[] = []
  let totalElectric = 0
  let totalClassic = 0
  for (const n of nearby) {
    totalElectric += n.station.ebikes
    totalClassic += n.station.bikes
  }
  for (const n of nearby) {
    if (left <= 0) break
    const have = wantElectric ? n.station.ebikes : n.station.bikes
    if (have <= 0) continue
    const take = Math.min(have, left)
    picks.push({ ...n, take })
    left -= take
  }
  return { picks, got: need - left, totalElectric, totalClassic }
}

/** Nächstgelegene MyRadl-Station im Radius maxDist Meter. */
export function nearestStation(p: LatLon, stations: Station[], maxDist = 150): Station | null {
  let best: Station | null = null
  let bestD = maxDist
  for (const s of stations) {
    const d = haversine(p, s)
    if (d < bestD) {
      bestD = d
      best = s
    }
  }
  return best
}

/**
 * Lotfußpunkt eines Punktes auf einer Strecke.
 * Auf Stadtmaßstab reicht die ebene Näherung; die Längengrade werden dabei
 * mit dem Kosinus der Breite gestaucht.
 */
function projectOnSegment(p: LatLon, a: LatLon, b: LatLon): { dist: number; t: number; point: LatLon } {
  const kx = Math.cos((p.lat * Math.PI) / 180) * 111320
  const ky = 110540
  const px = (p.lon - a.lon) * kx
  const py = (p.lat - a.lat) * ky
  const bx = (b.lon - a.lon) * kx
  const by = (b.lat - a.lat) * ky
  const len2 = bx * bx + by * by
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, (px * bx + py * by) / len2))
  const dx = px - t * bx
  const dy = py - t * by
  return {
    dist: Math.hypot(dx, dy),
    t,
    point: { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t },
  }
}

export interface PathProjection {
  /** Abstand zur Linie in Metern */
  dist: number
  /** Anteil der Strecke, der noch vor einem liegt (0…1) */
  share: number
  /** Zurückgelegter Weg entlang der Linie, in Metern */
  along: number
  /** Gesamtlänge der Linie in Metern */
  total: number
  /** Der auf die Linie gezogene Standort — für die Kartenanzeige */
  point: LatLon
}

/**
 * Den Standort auf die Etappenlinie projizieren.
 *
 * Liefert Abstand, zurückgelegten Weg, Restanteil und den auf die Linie
 * gezogenen Punkt. Aus dem Anteil wird die Restzeit (`Dauer × Anteil`) — eine
 * Geschwindigkeit muss dafür nicht geraten werden, die steckt schon in der
 * von MOTIS berechneten Etappendauer. Der gezogene Punkt ersetzt in der Karte
 * die rohe GPS-Position: sonst wandert der Marker sichtbar neben den Weg.
 *
 * `null`, wenn die Linie zu kurz ist, um daraus etwas abzuleiten.
 */
export function projectOnPath(path: LatLon[], pos: LatLon): PathProjection | null {
  if (!path || path.length < 2) return null

  const cum: number[] = [0]
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversine(path[i - 1], path[i]))
  const total = cum[cum.length - 1]
  if (total <= 0) return null

  let bestDist = Infinity
  let bestAlong = 0
  let bestPoint = path[0]
  for (let i = 1; i < path.length; i++) {
    const pr = projectOnSegment(pos, path[i - 1], path[i])
    if (pr.dist < bestDist) {
      bestDist = pr.dist
      bestAlong = cum[i - 1] + (cum[i] - cum[i - 1]) * pr.t
      bestPoint = pr.point
    }
  }

  return {
    dist: bestDist,
    share: Math.min(1, Math.max(0, (total - bestAlong) / total)),
    along: bestAlong,
    total,
    point: bestPoint,
  }
}

/** Anteil der Etappe, der noch vor einem liegt (0…1), oder null. */
export function remainingShare(path: LatLon[], pos: LatLon): number | null {
  return projectOnPath(path, pos)?.share ?? null
}

/** Abstand zur Etappenlinie in Metern, oder null. */
export function distanceToPath(path: LatLon[], pos: LatLon): number | null {
  return projectOnPath(path, pos)?.dist ?? null
}

/**
 * Kurs von `a` nach `b` in Grad, 0 = Norden, im Uhrzeigersinn.
 *
 * Für die Karte, die sich in Fahrtrichtung dreht: der Standortanbieter liefert
 * eine Blickrichtung nur, solange man sich bewegt — und im Web meist gar
 * keine. Aus zwei aufeinanderfolgenden Messungen lässt sie sich berechnen.
 */
export function bearing(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180
  const φ1 = a.lat * rad
  const φ2 = b.lat * rad
  const Δλ = (b.lon - a.lon) * rad
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (Math.atan2(y, x) / rad + 360) % 360
}

/** Kürzester Winkel zwischen zwei Kursen, −180…180 (positiv = nach rechts). */
export function bearingDelta(von: number, nach: number): number {
  return ((((nach - von) % 360) + 540) % 360) - 180
}

/**
 * Kurs sanft nachziehen.
 *
 * Ein roher Kurs aus GPS zappelt: schon zwei Meter Rauschen im Stand drehen
 * die Karte um 90°. Deshalb nur einen Teil des Weges gehen — und über die
 * 0°/360°-Naht hinweg richtig, sonst dreht die Karte bei Nordkurs einmal
 * komplett im Kreis.
 */
export function smoothBearing(alt: number | null, neu: number, anteil = 0.25): number {
  if (alt == null) return neu
  return (alt + bearingDelta(alt, neu) * anteil + 360) % 360
}
