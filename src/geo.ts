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
 * Senkrechter Abstand eines Punktes zu einer Strecke, in Metern.
 * Auf Stadtmaßstab reicht die ebene Näherung; die Längengrade werden dabei
 * mit dem Kosinus der Breite gestaucht.
 */
function distToSegment(p: LatLon, a: LatLon, b: LatLon): number {
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
  return Math.hypot(dx, dy)
}

export interface PathProjection {
  /** Abstand zur Linie in Metern */
  dist: number
  /** Anteil der Strecke, der noch vor einem liegt (0…1) */
  share: number
}

/**
 * Den Standort auf die Etappenlinie projizieren.
 *
 * Liefert, wie weit man neben der Linie steht und wie viel von ihr noch übrig
 * ist. Aus dem Anteil wird die Restzeit (`Dauer × Anteil`) — eine
 * Geschwindigkeit muss dafür nicht geraten werden, die steckt schon in der
 * von MOTIS berechneten Etappendauer.
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
  let bestEntlang = 0
  for (let i = 1; i < path.length; i++) {
    const d = distToSegment(pos, path[i - 1], path[i])
    if (d < bestDist) {
      bestDist = d
      // Fußpunkt grob am Segmentanfang — für Restzeit und Abweichung genau genug
      bestEntlang = cum[i - 1] + Math.min(haversine(path[i - 1], pos), cum[i] - cum[i - 1])
    }
  }

  return {
    dist: bestDist,
    share: Math.min(1, Math.max(0, (total - bestEntlang) / total)),
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
