import type { LatLon, Station } from './types'

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

/** Ближайшие станции вокруг точки (по возрастанию расстояния). */
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
 * Как набрать `need` великов нужного типа рядом: жадно, с ближайших станций.
 * Возвращает план разбора по станциям и сколько всего доступно каждого типа.
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

/** Ближайшая станция MyRadl в радиусе maxDist метров (точки MOTIS и GBFS чуть расходятся). */
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
