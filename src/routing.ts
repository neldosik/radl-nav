import { plan } from './api'
import type { PlanOpts } from './api'
import { nearbyStations, nearestStation } from './geo'
import { decodePolyline } from './polyline'
import type { BikeLegInfo, Itinerary, ItineraryView, LatLon, Station } from './types'

/** 28 statt 30 Min — Puffer für Stationssuche und Abstellen. */
export const FREE_LIMIT_SEC = 28 * 60

const MYRADL_SYSTEM_ID = 'nextbike_ml'
/** Umkreis, in dem Räder für eine Gruppe eingesammelt werden dürfen. */
const PICKUP_RADIUS_M = 600
/** Umkreis für die Wechselstation beim „Rad-Marathon". */
const SWAP_RADIUS_M = 600

export interface BuildOpts {
  /** Echte Stationen — Ausleihe, Rückgabe und Radwechsel nur hier. */
  stations: Station[]
  /** Stationen + freistehende Räder — nur zum Zählen der Verfügbarkeit. */
  supply: Station[]
  maxBikeSec: number
  classicOnly: boolean
}

/**
 * Baut aus einer MOTIS-Route die Ansicht mit Live-Raddaten.
 * Gibt null zurück, wenn die Route den Nutzervorgaben widerspricht
 * (fremder Anbieter, zu lange Radetappe, E-Bike im Standard-Modus).
 */
export function buildView(it: Itinerary, opts: BuildOpts): ItineraryView | null {
  const { stations, supply, maxBikeSec, classicOnly } = opts
  const bikeLegs = new Map<number, BikeLegInfo>()
  let hasBike = false
  let warnLong = false
  let hasElectric = false

  for (let i = 0; i < it.legs.length; i++) {
    const leg = it.legs[i]
    if (leg.mode !== 'RENTAL') continue

    // Nur MyRadl: Dott (Scooter UND Räder) ist kostenpflichtig — Route verwerfen.
    const isMyRadl =
      leg.rental?.systemId === MYRADL_SYSTEM_ID ||
      (leg.rental?.systemName ?? '').toLowerCase().includes('myradl')
    if (!isMyRadl) return null

    // Harte Nutzergrenze „nicht länger als N Minuten auf dem Rad".
    if (leg.duration > maxBikeSec) return null

    // E-Bike kostet immer; im Standard-Modus rausfiltern (Absicherung zum Serverfilter).
    const electric = !!leg.rental?.propulsionType && leg.rental.propulsionType !== 'HUMAN'
    if (electric && classicOnly) return null

    const freeFloating = !leg.rental?.fromStationName
    hasBike = true
    const info: BikeLegInfo = {
      startStation: freeFloating ? null : nearestStation(leg.from, stations),
      endStation: nearestStation(leg.to, stations),
      tooLong: !electric && leg.duration > FREE_LIMIT_SEC,
      electric,
      freeFloating,
      swapStation: null,
      nearby: nearbyStations(leg.from, supply, PICKUP_RADIUS_M, 6),
    }
    if (info.tooLong) info.swapStation = findSwapStation(leg, info, stations)
    if (info.tooLong) warnLong = true
    if (electric) hasElectric = true
    bikeLegs.set(i, info)
  }

  return { it, hasBike, warnLong, hasElectric, bikeLegs }
}

/**
 * „Rad-Marathon": Station etwa in der Mitte der Etappe, um das Rad zu tauschen
 * und im kostenlosen 30-Minuten-Fenster zu bleiben.
 */
function findSwapStation(
  leg: Itinerary['legs'][number],
  info: BikeLegInfo,
  stations: Station[],
): Station | null {
  if (!leg.legGeometry?.points) return null
  const pts = decodePolyline(leg.legGeometry.points, leg.legGeometry.precision ?? 6)
  const mid = pts[Math.floor(pts.length * 0.55)]
  if (!mid) return null
  // Docks sind bei MyRadl immer 0 (Flex-Stationen) — es zählen nur verfügbare Räder.
  const candidates = stations.filter(s => s.bikes > 0)
  const sw = nearestStation({ lat: mid[1], lon: mid[0] }, candidates, SWAP_RADIUS_M)
  if (!sw || sw.id === info.startStation?.id || sw.id === info.endStation?.id) return null
  return sw
}

/** Erkennt doppelte Vorschläge (gleiche Zeiten und gleiche Linienfolge). */
export function itinerarySignature(v: ItineraryView): string {
  const legs = v.it.legs.map(l => l.mode + (l.routeShortName ?? '')).join(',')
  return `${v.it.startTime}|${v.it.endTime}|${legs}`
}

/** Reine Fußwege interessieren nicht — die App dreht sich um Rad + ÖPNV. */
function isUseful(v: ItineraryView): boolean {
  return v.hasBike || v.it.legs.some(l => l.mode !== 'WALK')
}

export interface SearchOpts extends Omit<BuildOpts, 'stations' | 'supply'> {
  stations: Station[]
  supply: Station[]
  time?: PlanOpts
  signal?: AbortSignal
  maxResults?: number
}

/**
 * Sucht Routen und filtert sie nach den Nutzervorgaben. Bleiben zu wenige übrig
 * (abends baut MOTIS gern lange Radetappen), wird reiner ÖPNV nachgeladen.
 */
export async function searchRoutes(
  from: LatLon,
  to: LatLon,
  opts: SearchOpts,
): Promise<ItineraryView[]> {
  const { stations, supply, maxBikeSec, classicOnly, time = {}, signal, maxResults = 7 } = opts
  const build = (its: Itinerary[]) =>
    its
      .map(it => buildView(it, { stations, supply, maxBikeSec, classicOnly }))
      .filter((v): v is ItineraryView => v !== null)
      .filter(isUseful)

  const res = await plan(from, to, { classicOnly, ...time }, signal)
  const list = build([...(res.direct ?? []), ...res.itineraries])

  if (list.length < 2) {
    const res2 = await plan(from, to, { walkOnly: true, ...time }, signal)
    const seen = new Set(list.map(itinerarySignature))
    for (const v of build([...(res2.direct ?? []), ...res2.itineraries])) {
      if (!seen.has(itinerarySignature(v))) list.push(v)
    }
  }

  return list
    .sort((a, b) => +new Date(a.it.endTime) - +new Date(b.it.endTime))
    .slice(0, maxResults)
}
