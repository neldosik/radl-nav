import { plan } from './api'
import type { PlanOpts } from './api'
import { haversine, nearbyStations, nearestStation } from './geo'
import { decodePolyline } from './polyline'
import type { BikeLegInfo, Itinerary, ItineraryView, LatLon, Leg, Place, Station } from './types'

/** 28 statt 30 Min — Puffer für Stationssuche und Abstellen. */
export const FREE_LIMIT_SEC = 28 * 60

const MYRADL_SYSTEM_ID = 'nextbike_ml'
/** Umkreis, in dem Räder für eine Gruppe eingesammelt werden dürfen. */
const PICKUP_RADIUS_M = 600
/** Umkreis für die Wechselstation beim „Rad-Marathon". */
const SWAP_RADIUS_M = 600

/** MOTIS-Werte, die eine Rückgabe an einer Station verlangen. */
const STATION_RETURN = new Set(['ANY_STATION', 'ROUNDTRIP_STATION'])
/** Toleranz, wenn die Etappe ohnehin schon an einer Station endet. */
const RETURN_MATCH_RADIUS_M = 250
/** Suchradius für die Rückgabestation, wenn MOTIS frei abstellen will. */
export const RETURN_SNAP_RADIUS_M = 1500
/** Grobes Radtempo (~15 km/h) für die Zusatzzeit bis zur Station. */
const BIKE_SPEED_MS = 4.2

/**
 * Darf das Rad am Etappenende überhaupt abgestellt werden?
 *
 * MyRadl erlaubt die Rückgabe **nur** an offiziellen Stationen — außerhalb
 * kostet es 20 € Strafe. MOTIS weiß das nicht: der GBFS-Feed meldet für
 * freistehende Räder `returnConstraint: NONE`, worauf MOTIS die Radetappe
 * irgendwo beendet — in der Praxis am nächsten anderen freistehenden Rad
 * (geprüft 27.07.2026: Etappenende 0 m vom freien Rad, 317 m zur Station).
 * Genau das führte den Nutzer zum falschen Ziel.
 */
export function returnsToStation(leg: Leg): boolean {
  const rc = leg.rental?.returnConstraint
  if (rc) return STATION_RETURN.has(rc)
  // Ältere MOTIS-Stände ohne das Feld: Stationsname am Ende als Ersatzsignal
  return !!leg.rental?.toStationName
}

/**
 * Tatsächliches Ziel einer Etappe. Bei Radetappen ist das die
 * Rückgabestation, nicht der von MOTIS gewählte Abstellpunkt — sonst navigiert
 * die App zu einem fremden Rad am Straßenrand.
 */
export function legTarget(view: ItineraryView, i: number): Place | null {
  const leg = view.it.legs[i]
  if (!leg) return null
  const b = view.bikeLegs.get(i)
  if (b?.returnSnapped && b.endStation) {
    return { name: b.endStation.name, lat: b.endStation.lat, lon: b.endStation.lon }
  }
  return { name: leg.to.name, lat: leg.to.lat, lon: leg.to.lon }
}

/** Fahrtdauer inklusive der Umwege zu den Rückgabestationen. */
export function viewDuration(v: ItineraryView): number {
  return v.it.duration + v.extraSec
}

/**
 * Ankunftszeit inklusive derselben Umwege.
 *
 * `it.endTime` kommt unverändert von MOTIS und weiß nichts von der
 * Umhängung auf die Rückgabestation. Die Karte zeigte deshalb nebeneinander
 * eine korrigierte Dauer und eine unkorrigierte Ankunft — bei 900 m Umweg
 * lagen die beiden Angaben rund vier Minuten auseinander.
 */
export function viewEndTime(v: ItineraryView): string {
  if (!v.extraSec) return v.it.endTime
  return new Date(+new Date(v.it.endTime) + v.extraSec * 1000).toISOString()
}

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
  let warnReturn = false
  let extraSec = 0

  for (let i = 0; i < it.legs.length; i++) {
    const leg = it.legs[i]
    if (leg.mode !== 'RENTAL') continue

    // Nur MyRadl: Dott (Scooter UND Räder) ist kostenpflichtig — Route verwerfen.
    const isMyRadl =
      leg.rental?.systemId === MYRADL_SYSTEM_ID ||
      (leg.rental?.systemName ?? '').toLowerCase().includes('myradl')
    if (!isMyRadl) return null

    // E-Bike kostet immer; im Standard-Modus rausfiltern (Absicherung zum Serverfilter).
    const electric = !!leg.rental?.propulsionType && leg.rental.propulsionType !== 'HUMAN'
    if (electric && classicOnly) return null

    // Rückgabe zwingend an einer Station — MOTIS-Enden „im Feld" umbiegen.
    const stationReturn = returnsToStation(leg)
    const endStation = nearestStation(
      leg.to,
      stations,
      stationReturn ? RETURN_MATCH_RADIUS_M : RETURN_SNAP_RADIUS_M,
    )
    const returnSnapped = !stationReturn && !!endStation
    const returnDetourM = returnSnapped ? Math.round(haversine(leg.to, endStation!)) : 0
    const returnDetourSec = Math.round(returnDetourM / BIKE_SPEED_MS)
    // Keine Station in Reichweite: Route bleibt sichtbar, aber deutlich markiert —
    // sie ganz zu verwerfen hieße bei GBFS-Ausfall „keine Routen gefunden".
    const noReturnStation = !stationReturn && !endStation && stations.length > 0

    // Harte Nutzergrenze „nicht länger als N Minuten auf dem Rad" — der Umweg
    // zur Rückgabestation zählt mit, er wird ja auch gefahren.
    const rideSec = leg.duration + returnDetourSec
    if (rideSec > maxBikeSec) return null

    const freeFloating = !leg.rental?.fromStationName
    hasBike = true
    const info: BikeLegInfo = {
      startStation: freeFloating ? null : nearestStation(leg.from, stations),
      endStation,
      tooLong: !electric && rideSec > FREE_LIMIT_SEC,
      electric,
      freeFloating,
      returnSnapped,
      returnDetourM,
      returnDetourSec,
      noReturnStation,
      swapStation: null,
      nearby: nearbyStations(leg.from, supply, PICKUP_RADIUS_M, 6),
    }
    if (info.tooLong) info.swapStation = findSwapStation(leg, info, stations)
    if (info.tooLong) warnLong = true
    if (electric) hasElectric = true
    if (noReturnStation) warnReturn = true
    extraSec += returnDetourSec
    bikeLegs.set(i, info)
  }

  return { it, hasBike, warnLong, hasElectric, warnReturn, extraSec, bikeLegs }
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
    // Zusatzsuche ist Kür: schlägt sie fehl (HTTP-Fehler, Zeitüberschreitung),
    // behalten wir die bereits gefundene Route. Vorher riss die Ausnahme die
    // ganze Suche mit — der Nutzer sah „keine Verbindung", obwohl eine
    // gültige Route schon vorlag.
    try {
      const res2 = await plan(from, to, { walkOnly: true, ...time }, signal)
      const seen = new Set(list.map(itinerarySignature))
      for (const v of build([...(res2.direct ?? []), ...res2.itineraries])) {
        if (!seen.has(itinerarySignature(v))) list.push(v)
      }
    } catch (e) {
      // Abbruch durch den Nutzer bleibt ein Abbruch
      if ((e as Error)?.name === 'AbortError') throw e
    }
  }

  // Routen ohne erreichbare Rückgabestation nach hinten — sie kosten 20 € Strafe.
  return list
    .sort(
      (a, b) =>
        Number(a.warnReturn) - Number(b.warnReturn) ||
        +new Date(viewEndTime(a)) - +new Date(viewEndTime(b)),
    )
    .slice(0, maxResults)
}
