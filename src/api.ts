import { parseFreeBikes, parseStations } from './gbfs'
import type { GbfsFreeBike, GbfsStationInfo, GbfsStationStatus, GbfsVehicleType } from './gbfs'
import type { FreeBike, GeocodeMatch, LatLon, PlanResponse, Station } from './types'

const MOTIS = 'https://api.transitous.org/api'
const GBFS = 'https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_ml/de'
const MUNICH_CENTER = '48.137,11.575'

export async function geocode(text: string, signal?: AbortSignal): Promise<GeocodeMatch[]> {
  const u = new URL(`${MOTIS}/v1/geocode`)
  u.searchParams.set('text', text)
  u.searchParams.set('language', 'de')
  u.searchParams.set('place', MUNICH_CENTER)
  u.searchParams.set('placeBias', '3') // ohne dies schlägt Duisburg Münchner Haltestellen
  const r = await fetch(u, { signal })
  if (!r.ok) throw new Error(`geocode HTTP ${r.status}`)
  return r.json()
}

/** Koordinaten → menschenlesbare Adresse (nächstgelegener Punkt). */
export async function reverseGeocode(lat: number, lon: number, signal?: AbortSignal): Promise<string> {
  const u = new URL(`${MOTIS}/v1/reverse-geocode`)
  u.searchParams.set('place', `${lat},${lon}`)
  const r = await fetch(u, { signal })
  if (!r.ok) throw new Error(`reverse HTTP ${r.status}`)
  const arr = (await r.json()) as GeocodeMatch[]
  return arr?.[0]?.name ?? 'Mein Standort'
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
    const r = await fetch(u, { signal })
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
export async function fetchWeatherAt(lat: number, lon: number, when: Date): Promise<WeatherAtTime | null> {
  const u = new URL('https://api.open-meteo.com/v1/forecast')
  u.searchParams.set('latitude', String(lat))
  u.searchParams.set('longitude', String(lon))
  u.searchParams.set('hourly', 'temperature_2m,precipitation')
  u.searchParams.set('forecast_days', '2')
  u.searchParams.set('timezone', 'auto')
  const r = await fetch(u)
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

/** GPS-Koordinaten des Browsers (Promise-Wrapper über Geolocation). */
export function getGeolocation(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('geolocation unavailable'))
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 8000 },
    )
  })
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
  const r = await fetch(u, { signal })
  if (!r.ok) throw new Error(`plan HTTP ${r.status}`)
  return r.json()
}

/** Holt einen GBFS-Feed; bei Fehler null statt Exception. */
async function gbfs(feed: string): Promise<unknown> {
  try {
    const r = await fetch(`${GBFS}/${feed}.json`)
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
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

/** Live-Status aller MyRadl-Stationen (GBFS, ttl 60 Sek, inkl. Offline-Кэш). */
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
    // Ошибка сети — пробуем достать из оффлайн-кэша
  }

  try {
    const cached = localStorage.getItem(STATIONS_CACHE_KEY)
    if (cached) {
      const { data } = JSON.parse(cached)
      if (Array.isArray(data)) return data
    }
  } catch {}

  return []
}

