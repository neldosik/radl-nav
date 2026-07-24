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

export interface WeatherAtTime {
  temp: number // °C
  precip: number // mm pro Stunde
  rain: boolean // spürbarer Regen
  timeLabel: string // HH:MM Vorhersagestunde
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
  return {
    temp: Math.round(temps[bi] ?? 0),
    precip,
    rain: precip >= 0.3,
    timeLabel: times[bi]?.slice(11, 16) ?? '',
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

interface GbfsStationInfo {
  station_id: string
  name: string
  lat: number
  lon: number
}

interface GbfsStationStatus {
  station_id: string
  num_bikes_available: number
  num_docks_available?: number
  vehicle_types_available?: { vehicle_type_id: string; count: number }[]
}

interface GbfsVehicleType {
  vehicle_type_id: string
  form_factor?: string
  propulsion_type?: string
}

interface GbfsFreeBike {
  bike_id: string
  lat?: number
  lon?: number
  vehicle_type_id?: string
  is_reserved?: boolean
  is_disabled?: boolean
  station_id?: string // gesetzt => Rad steht an einer Station (schon in station_status gezählt)
}

/** Freistehende MyRadl-Räder (nicht an einer Station) — können ebenfalls geliehen werden. */
export async function loadFreeBikes(): Promise<FreeBike[]> {
  try {
    const [fb, types] = await Promise.all([
      fetch(`${GBFS}/free_bike_status.json`).then(r => (r.ok ? r.json() : null)),
      fetch(`${GBFS}/vehicle_types.json`).then(r => (r.ok ? r.json() : null)).catch(() => null),
    ])
    if (!fb?.data?.bikes) return []
    const electric = new Set<string>()
    for (const vt of (types?.data?.vehicle_types ?? []) as GbfsVehicleType[]) {
      if (vt.propulsion_type && vt.propulsion_type !== 'human') electric.add(vt.vehicle_type_id)
    }
    // WICHTIG: free_bike_status enthält ALLE Räder — auch die an Stationen
    // (~4100 von ~4500 haben station_id). Ohne diesen Filter würden Stationsräder
    // doppelt gezählt (einmal via station_status, einmal hier).
    return ((fb.data?.bikes ?? []) as GbfsFreeBike[])
      .filter(b => !b.station_id)
      .filter(b => !b.is_disabled && !b.is_reserved && typeof b.lat === 'number' && typeof b.lon === 'number')
      .map(b => ({
        id: b.bike_id,
        lat: b.lat!,
        lon: b.lon!,
        electric: !!b.vehicle_type_id && electric.has(b.vehicle_type_id),
      }))
  } catch (e) {
    console.warn('GBFS free bikes loading failed:', e)
    return []
  }
}

/** Live-Status aller MyRadl-Stationen (GBFS, ttl 60 Sek). */
export async function loadStations(): Promise<Station[]> {
  try {
    const [info, status, types] = await Promise.all([
      fetch(`${GBFS}/station_information.json`).then(r => (r.ok ? r.json() : null)),
      fetch(`${GBFS}/station_status.json`).then(r => (r.ok ? r.json() : null)),
      fetch(`${GBFS}/vehicle_types.json`).then(r => (r.ok ? r.json() : null)).catch(() => null),
    ])

    if (!info?.data?.stations || !status?.data?.stations) return []

    const electric = new Set<string>()
    for (const vt of (types?.data?.vehicle_types ?? []) as GbfsVehicleType[]) {
      if (vt.propulsion_type && vt.propulsion_type !== 'human') electric.add(vt.vehicle_type_id)
    }

    const statusById = new Map<string, GbfsStationStatus>()
    for (const s of (status.data?.stations ?? []) as GbfsStationStatus[]) statusById.set(s.station_id, s)

    return ((info.data?.stations ?? []) as GbfsStationInfo[]).map(si => {
      const st = statusById.get(si.station_id)
      let ebikes = 0
      for (const v of st?.vehicle_types_available ?? []) {
        if (electric.has(v.vehicle_type_id)) ebikes += v.count
      }
      const total = st?.num_bikes_available ?? 0
      return {
        id: si.station_id,
        name: si.name,
        lat: si.lat,
        lon: si.lon,
        bikes: Math.max(0, total - ebikes),
        ebikes,
        docks: st?.num_docks_available ?? null,
      }
    })
  } catch (e) {
    console.warn('GBFS stations loading failed:', e)
    return []
  }
}

