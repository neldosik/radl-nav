import { currentPosition } from './geolocation'
import { parseFreeBikes, parseStations } from './gbfs'
import type { GbfsFreeBike, GbfsStationInfo, GbfsStationStatus, GbfsVehicleType } from './gbfs'
import type { FreeBike, GeocodeMatch, LatLon, PlanResponse, Station } from './types'

/**
 * Netzfehler mit Ursache. Vorher wurde in App.tsx über den Meldungstext
 * geraten (`message.includes('fetch')`) — in Safari heißt der Text „Load
 * failed", in Firefox anders, und ein HTTP 500 sah aus wie ein Programmfehler.
 */
export class ApiError extends Error {
  kind: 'network' | 'http' | 'timeout'
  status?: number

  constructor(message: string, kind: 'network' | 'http' | 'timeout', status?: number) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
  }
}

/** Netzausfall und Zeitüberschreitung einheitlich einpacken. */
function asApiError(e: unknown, was: string): never {
  const name = (e as Error)?.name
  if (name === 'AbortError') throw e
  if (name === 'TimeoutError') throw new ApiError(`${was} Zeitüberschreitung`, 'timeout')
  throw new ApiError(`${was} nicht erreichbar`, 'network')
}

const MOTIS = 'https://api.transitous.org/api'
const GBFS = 'https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_ml/de'
const MUNICH_CENTER = '48.137,11.575'

/** Netzaufruf mit Zeitgrenze. Ohne sie blieb der Ladezustand hängen, wenn ein
 *  Dienst nicht antwortet — abgebrochen wird auch weiterhin über `signal`. */
const REQUEST_TIMEOUT_MS = 20_000
/** Die Routensuche bei Transitous ist der schwere Aufruf: meist ~2 s, unter
 *  Last aber auch mal über 20 s. Sie bekommt deshalb mehr Luft als die
 *  kleinen Abfragen (Geocode, Wetter, GBFS). */
const PLAN_TIMEOUT_MS = 45_000
function withTimeout(signal?: AbortSignal, ms = REQUEST_TIMEOUT_MS): AbortSignal {
  const limit = AbortSignal.timeout(ms)
  return signal ? AbortSignal.any([signal, limit]) : limit
}

export async function geocode(text: string, signal?: AbortSignal): Promise<GeocodeMatch[]> {
  const u = new URL(`${MOTIS}/v1/geocode`)
  u.searchParams.set('text', text)
  u.searchParams.set('language', 'de')
  u.searchParams.set('place', MUNICH_CENTER)
  u.searchParams.set('placeBias', '3') // ohne dies schlägt Duisburg Münchner Haltestellen
  let r: Response
  try {
    r = await fetch(u, { signal: withTimeout(signal) })
  } catch (e) {
    asApiError(e, 'Ortssuche')
  }
  if (!r.ok) throw new ApiError(`geocode HTTP ${r.status}`, 'http', r.status)
  return r.json()
}

/** Koordinaten → menschenlesbare Adresse, oder null wenn nichts passt.
 *  Die Ersatzbeschriftung gehört zur Oberfläche, nicht hierher — vorher stand
 *  hier fest »Mein Standort«, auch bei englischer Oberfläche. */
export async function reverseGeocode(lat: number, lon: number, signal?: AbortSignal): Promise<string | null> {
  const u = new URL(`${MOTIS}/v1/reverse-geocode`)
  u.searchParams.set('place', `${lat},${lon}`)
  const r = await fetch(u, { signal: withTimeout(signal) })
  if (!r.ok) throw new Error(`reverse HTTP ${r.status}`)
  const arr = (await r.json()) as GeocodeMatch[]
  return arr?.[0]?.name ?? null
}

export interface WeatherHour {
  timeLabel: string
  temp: number
  precip: number
  rain: boolean
}

export interface WeatherAtTime {
  temp: number // °C
  precip: number // mm pro Stunde
  rain: boolean // spürbarer Regen
  timeLabel: string // HH:MM Vorhersagestunde
  hourly?: WeatherHour[]
}



export interface ElevationProfile {
  gain: number // Aufstieg in Metern (↗)
  loss: number // Abstieg in Metern (↘)
}

/** Echter Höhenverlauf entlang von Routenpunkten (Open-Meteo Elevation API). */
export async function fetchElevationProfile(pts: [number, number][], signal?: AbortSignal): Promise<ElevationProfile | null> {
  if (!pts || pts.length < 2) return null
  // Maximal 25 gleichmäßige Punkte samplen, um die URL kompakt zu halten
  const step = Math.max(1, Math.floor(pts.length / 25))
  const sampled: [number, number][] = []
  for (let i = 0; i < pts.length; i += step) sampled.push(pts[i])
  if (sampled[sampled.length - 1] !== pts[pts.length - 1]) sampled.push(pts[pts.length - 1])

  const lats = sampled.map(p => p[1].toFixed(5)).join(',')
  const lons = sampled.map(p => p[0].toFixed(5)).join(',')

  try {
    const u = new URL('https://api.open-meteo.com/v1/elevation')
    u.searchParams.set('latitude', lats)
    u.searchParams.set('longitude', lons)
    const r = await fetch(u, { signal: withTimeout(signal) })
    if (!r.ok) return null
    const d = await r.json()
    const elevations: number[] = d?.elevation ?? []
    if (elevations.length < 2) return null

    let gain = 0
    let loss = 0
    for (let i = 1; i < elevations.length; i++) {
      const diff = elevations[i] - elevations[i - 1]
      if (diff > 0.5) gain += diff
      else if (diff < -0.5) loss += Math.abs(diff)
    }

    return { gain: Math.round(gain), loss: Math.round(loss) }
  } catch {
    return null
  }
}

/** Vorhersage (Open-Meteo, ohne Key) für bestimmte Stunde am Punkt. rain = Niederschlag ≥ 0.3 mm. */
export async function fetchWeatherAt(
  lat: number,
  lon: number,
  when: Date,
  signal?: AbortSignal,
): Promise<WeatherAtTime | null> {
  try {
    return await fetchWeatherInner(lat, lon, when, signal)
  } catch {
    // Wetter ist Beiwerk — ein Ausfall darf die Suche nicht stören. Als
    // einzige Netzfunktion warf diese hier und erzeugte beim Aufrufer eine
    // unbehandelte Zusage.
    return null
  }
}

async function fetchWeatherInner(
  lat: number,
  lon: number,
  when: Date,
  signal?: AbortSignal,
): Promise<WeatherAtTime | null> {
  const u = new URL('https://api.open-meteo.com/v1/forecast')
  u.searchParams.set('latitude', String(lat))
  u.searchParams.set('longitude', String(lon))
  u.searchParams.set('hourly', 'temperature_2m,precipitation')
  // Vorhersagefenster an die gewünschte Zeit anpassen: bei „Ankunft in vier
  // Tagen" reichten zwei Tage nicht, und die Suche unten nahm dann einfach die
  // letzte verfügbare Stunde — eine Vorhersage aus einem anderen Zeitraum.
  const tageVoraus = Math.ceil((when.getTime() - Date.now()) / 86_400_000) + 1
  u.searchParams.set('forecast_days', String(Math.min(16, Math.max(2, tageVoraus))))
  u.searchParams.set('timezone', 'auto')
  const r = await fetch(u, { signal: withTimeout(signal) })
  if (!r.ok) return null
  const d = await r.json()
  const times: string[] = d?.hourly?.time ?? []
  const temps: number[] = d?.hourly?.temperature_2m ?? []
  const precs: number[] = d?.hourly?.precipitation ?? []
  if (!times.length) return null
  // Nächstgelegene Stunde zur angefragten Zeit
  const target = when.getTime()
  let bi = 0
  let bd = Infinity
  for (let i = 0; i < times.length; i++) {
    const dd = Math.abs(new Date(times[i]).getTime() - target)
    if (dd < bd) {
      bd = dd
      bi = i
    }
  }
  // Liegt die gewünschte Stunde außerhalb der gelieferten Daten, ist der
  // „beste" Treffer bedeutungslos — dann lieber gar kein Wetter zeigen.
  if (bd > 60 * 60 * 1000) return null
  const precip = precs[bi] ?? 0
  // Die nächsten Stunden mitgeben — daraus baut die Oberfläche den Regenverlauf.
  const hourly: WeatherHour[] = []
  for (let i = bi; i < Math.min(times.length, bi + 12); i++) {
    const p = precs[i] ?? 0
    hourly.push({
      timeLabel: times[i]?.slice(11, 16) ?? '',
      temp: Math.round(temps[i] ?? 0),
      precip: p,
      rain: p >= 0.3,
    })
  }
  return {
    temp: Math.round(temps[bi] ?? 0),
    precip,
    rain: precip >= 0.3,
    timeLabel: times[bi]?.slice(11, 16) ?? '',
    hourly,
  }
}

/** Einmalige Ortung — nativ über die App-Hülle, im Web über den Browser. */
export function getGeolocation(): Promise<{ lat: number; lon: number }> {
  return currentPosition()
}

/** providerId MyRadl in Transitous (siehe /api/v1/rentals); systemId `nextbike_ml` Filter akzeptiert NICHT. */
const MYRADL_PROVIDER = 'de-MyRadlMunich'

export interface PlanOpts {
  walkOnly?: boolean
  classicOnly?: boolean // nur normale Räder (HUMAN), ohne Elektro
  time?: Date // Abfahrts- oder Ankunftszeit
  arriveBy?: boolean // true = time als gewünschte Ankunft interpretiert
}

export async function plan(from: LatLon, to: LatLon, opts: PlanOpts = {}, signal?: AbortSignal): Promise<PlanResponse> {
  const u = new URL(`${MOTIS}/v5/plan`)
  u.searchParams.set('fromPlace', `${from.lat},${from.lon}`)
  u.searchParams.set('toPlace', `${to.lat},${to.lon}`)
  if (opts.time) {
    u.searchParams.set('time', opts.time.toISOString())
    if (opts.arriveBy) u.searchParams.set('arriveBy', 'true')
  }
  if (opts.walkOnly) {
    // Sicherheitsanfrage: reiner ÖPNV ohne Verleih
    u.searchParams.set('preTransitModes', 'WALK')
    u.searchParams.set('postTransitModes', 'WALK')
    u.searchParams.set('directModes', 'WALK')
    u.searchParams.set('numItineraries', '5')
  } else {
    // Rad erlaubt vor Transit, nach Transit und als direkter Weg
    u.searchParams.set('preTransitModes', 'WALK,RENTAL')
    u.searchParams.set('postTransitModes', 'WALK,RENTAL')
    u.searchParams.set('directModes', 'WALK,RENTAL')
    // Nur MyRadl: sonst steckt MOTIS Dott (Scooter UND Räder) in jede Route
    u.searchParams.set('preTransitRentalProviders', MYRADL_PROVIDER)
    u.searchParams.set('postTransitRentalProviders', MYRADL_PROVIDER)
    u.searchParams.set('directRentalProviders', MYRADL_PROVIDER)
    u.searchParams.set('preTransitRentalFormFactors', 'BICYCLE')
    u.searchParams.set('postTransitRentalFormFactors', 'BICYCLE')
    u.searchParams.set('directRentalFormFactors', 'BICYCLE')
    if (opts.classicOnly) {
      // Nur Standardräder: E-Bike kostenpflichtig auch mit Abo
      u.searchParams.set('preTransitRentalPropulsionTypes', 'HUMAN')
      u.searchParams.set('postTransitRentalPropulsionTypes', 'HUMAN')
      u.searchParams.set('directRentalPropulsionTypes', 'HUMAN')
    }
    // 30 Minuten Rad-Anfahrt statt standardmäßiger 15 — für kostenloses MyRadl-Fenster;
    // direkte Radvariante bis 45 Min (danach harte Nutzergrenze).
    u.searchParams.set('maxPreTransitTime', '1800')
    u.searchParams.set('maxPostTransitTime', '1800')
    u.searchParams.set('maxDirectTime', '2700')
    // mit Reserve: ein Teil der Optionen wird durch Kunden-Radzeit-Limit gefiltert
    u.searchParams.set('numItineraries', '7')
  }
  let r: Response
  try {
    r = await fetch(u, { signal: withTimeout(signal, PLAN_TIMEOUT_MS) })
  } catch (e) {
    asApiError(e, 'Routensuche')
  }
  if (!r.ok) throw new ApiError(`plan HTTP ${r.status}`, 'http', r.status)
  return r.json()
}

/** Kurzlebiger Puffer je Feed. loadStations() und loadFreeBikes() laufen bei
 *  jeder Suche parallel und holten beide `free_bike_status` (1,7 MB) und
 *  `vehicle_types` — also 1,7 MB doppelt pro Suche. Der Feed hat laut GBFS
 *  ohnehin ttl 60, häufiger als alle 30 s lohnt kein neuer Abruf. */
const FEED_TTL_MS = 30_000
const feedCache = new Map<string, { at: number; value: unknown }>()
const feedInFlight = new Map<string, Promise<unknown>>()

/** Holt einen GBFS-Feed; bei Fehler null statt Exception. */
async function gbfs(feed: string): Promise<unknown> {
  const cached = feedCache.get(feed)
  if (cached && Date.now() - cached.at < FEED_TTL_MS) return cached.value

  const running = feedInFlight.get(feed)
  if (running) return running

  const task = (async () => {
    try {
      const r = await fetch(`${GBFS}/${feed}.json`, { signal: AbortSignal.timeout(20_000) })
      const value = r.ok ? await r.json() : null
      if (value != null) feedCache.set(feed, { at: Date.now(), value })
      return value
    } catch {
      return null
    } finally {
      feedInFlight.delete(feed)
    }
  })()

  feedInFlight.set(feed, task)
  return task
}

type FeedData = { data?: Record<string, unknown> } | null
const feedList = <T>(d: FeedData, key: string): T[] | null =>
  (d?.data?.[key] as T[] | undefined) ?? null

/** Freistehende MyRadl-Räder (nicht an einer Station) — können ebenfalls geliehen werden. */
export async function loadFreeBikes(): Promise<FreeBike[]> {
  const [fb, types] = (await Promise.all([gbfs('free_bike_status'), gbfs('vehicle_types')])) as [
    FeedData,
    FeedData,
  ]
  return parseFreeBikes(
    feedList<GbfsFreeBike>(fb, 'bikes'),
    feedList<GbfsVehicleType>(types, 'vehicle_types'),
  )
}

const STATIONS_CACHE_KEY = 'radl.stations_cache'
/** Wie alt der Offline-Stand höchstens sein darf. Radzahlen von gestern sind
 *  eine Vermutung, die von letzter Woche eine Falschaussage — und die App
 *  zeigte sie ohne Vorbehalt als Live-Bestand an. */
const STATIONS_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000

/** Live-Status aller MyRadl-Stationen (GBFS, ttl 60 Sek, inkl. Offline-Puffer). */
export async function loadStations(): Promise<Station[]> {
  try {
    const [info, status, types, fb] = (await Promise.all([
      gbfs('station_information'),
      gbfs('station_status'),
      gbfs('vehicle_types'),
      gbfs('free_bike_status'),
    ])) as [FeedData, FeedData, FeedData, FeedData]

    const parsed = parseStations(
      feedList<GbfsStationInfo>(info, 'stations'),
      feedList<GbfsStationStatus>(status, 'stations'),
      feedList<GbfsVehicleType>(types, 'vehicle_types'),
      feedList<GbfsFreeBike>(fb, 'bikes'),
    )

    if (parsed.length > 0) {
      try {
        localStorage.setItem(STATIONS_CACHE_KEY, JSON.stringify({ at: Date.now(), data: parsed }))
      } catch {}
      return parsed
    }
  } catch {
    // Netzfehler — unten den Offline-Puffer versuchen
  }

  try {
    const cached = localStorage.getItem(STATIONS_CACHE_KEY)
    if (cached) {
      // `at` wurde beim Schreiben immer mitgespeichert, beim Lesen aber nie
      // ausgewertet — beliebig alte Bestände galten als aktuell.
      const { at, data } = JSON.parse(cached)
      const alter = typeof at === 'number' ? Date.now() - at : Infinity
      if (Array.isArray(data) && alter < STATIONS_CACHE_MAX_AGE_MS) return data
    }
  } catch {}

  return []
}


export interface TripStatus {
  /** Verspätung in Minuten, negativ = zu früh */
  delayMin: number
  cancelled: boolean
  /** Trägt die Antwort überhaupt Echtzeitdaten? */
  realTime: boolean
}

/**
 * Aktueller Stand einer laufenden Fahrt.
 *
 * Die Verspätungen aus der Routensuche sind Momentaufnahmen vom Zeitpunkt der
 * Suche. Wer schon unterwegs ist, erfährt sonst nichts davon, dass die Bahn
 * inzwischen zehn Minuten später kommt. `/api/v1/trip` liefert genau eine
 * Fahrt — deutlich billiger als die ganze Suche zu wiederholen.
 */
export async function fetchTripStatus(tripId: string, signal?: AbortSignal): Promise<TripStatus | null> {
  const u = new URL(`${MOTIS}/v1/trip`)
  u.searchParams.set('tripId', tripId)
  let r: Response
  try {
    r = await fetch(u, { signal: withTimeout(signal) })
  } catch (e) {
    // Kein Netz — der zuletzt bekannte Stand bleibt einfach stehen
    if ((e as Error)?.name === 'AbortError') throw e
    return null
  }
  if (!r.ok) return null

  const j = (await r.json()) as {
    legs?: { startTime?: string; scheduledStartTime?: string; realTime?: boolean; cancelled?: boolean }[]
  }
  const leg = j.legs?.[0]
  if (!leg?.startTime || !leg.scheduledStartTime) return null

  const ist = new Date(leg.startTime).getTime()
  const soll = new Date(leg.scheduledStartTime).getTime()
  if (Number.isNaN(ist) || Number.isNaN(soll)) return null

  return {
    delayMin: Math.round((ist - soll) / 60000),
    cancelled: !!leg.cancelled,
    realTime: !!leg.realTime,
  }
}
