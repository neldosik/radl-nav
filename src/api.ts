import type { GeocodeMatch, LatLon, PlanResponse, Station } from './types'

const MOTIS = 'https://api.transitous.org/api'
const GBFS = 'https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_ml/de'
const MUNICH_CENTER = '48.137,11.575'

export async function geocode(text: string): Promise<GeocodeMatch[]> {
  const u = new URL(`${MOTIS}/v1/geocode`)
  u.searchParams.set('text', text)
  u.searchParams.set('language', 'de')
  u.searchParams.set('place', MUNICH_CENTER)
  u.searchParams.set('placeBias', '3') // без этого Duisburg обгоняет мюнхенские остановки
  const r = await fetch(u)
  if (!r.ok) throw new Error(`geocode HTTP ${r.status}`)
  return r.json()
}

/** Координаты → человекочитаемый адрес (ближайшая точка). */
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const u = new URL(`${MOTIS}/v1/reverse-geocode`)
  u.searchParams.set('place', `${lat},${lon}`)
  const r = await fetch(u)
  if (!r.ok) throw new Error(`reverse HTTP ${r.status}`)
  const arr = (await r.json()) as GeocodeMatch[]
  return arr?.[0]?.name ?? 'Моё местоположение'
}

/** GPS-координаты браузера (Promise-обёртка над geolocation). */
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

/** providerId MyRadl в Transitous (см. /api/v1/rentals); systemId `nextbike_ml` фильтр НЕ принимает. */
const MYRADL_PROVIDER = 'de-MyRadlMunich'

export interface PlanOpts {
  walkOnly?: boolean
  classicOnly?: boolean // только обычные велики (HUMAN), без электро
}

export async function plan(from: LatLon, to: LatLon, opts: PlanOpts = {}): Promise<PlanResponse> {
  const u = new URL(`${MOTIS}/v5/plan`)
  u.searchParams.set('fromPlace', `${from.lat},${from.lon}`)
  u.searchParams.set('toPlace', `${to.lat},${to.lon}`)
  if (opts.walkOnly) {
    // Страховочный запрос: чистый транспорт без прокатов.
    u.searchParams.set('preTransitModes', 'WALK')
    u.searchParams.set('postTransitModes', 'WALK')
    u.searchParams.set('directModes', 'WALK')
    u.searchParams.set('numItineraries', '5')
  } else {
    // Велик разрешён до транспорта, после транспорта и как прямой вариант.
    u.searchParams.set('preTransitModes', 'WALK,RENTAL')
    u.searchParams.set('postTransitModes', 'WALK,RENTAL')
    u.searchParams.set('directModes', 'WALK,RENTAL')
    // Только MyRadl: иначе MOTIS суёт Dott (самокаты И велики) в каждый маршрут.
    u.searchParams.set('preTransitRentalProviders', MYRADL_PROVIDER)
    u.searchParams.set('postTransitRentalProviders', MYRADL_PROVIDER)
    u.searchParams.set('directRentalProviders', MYRADL_PROVIDER)
    u.searchParams.set('preTransitRentalFormFactors', 'BICYCLE')
    u.searchParams.set('postTransitRentalFormFactors', 'BICYCLE')
    u.searchParams.set('directRentalFormFactors', 'BICYCLE')
    if (opts.classicOnly) {
      // только обычные велики: e-bike платный даже с абонементом
      u.searchParams.set('preTransitRentalPropulsionTypes', 'HUMAN')
      u.searchParams.set('postTransitRentalPropulsionTypes', 'HUMAN')
      u.searchParams.set('directRentalPropulsionTypes', 'HUMAN')
    }
    // 30 минут вело-подъезда вместо дефолтных 15 — под бесплатное окно MyRadl;
    // прямой вело-вариант до 45 мин (дальше жёсткий клиентский лимит пользователя).
    u.searchParams.set('maxPreTransitTime', '1800')
    u.searchParams.set('maxPostTransitTime', '1800')
    u.searchParams.set('maxDirectTime', '2700')
    // с запасом: часть вариантов отсеет клиентский лимит вело-времени
    u.searchParams.set('numItineraries', '7')
  }
  const r = await fetch(u)
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

/** Живое состояние всех станций MyRadl (GBFS, ttl 60 сек). */
export async function loadStations(): Promise<Station[]> {
  const [info, status, types] = await Promise.all([
    fetch(`${GBFS}/station_information.json`).then(r => r.json()),
    fetch(`${GBFS}/station_status.json`).then(r => r.json()),
    fetch(`${GBFS}/vehicle_types.json`).then(r => r.json()).catch(() => null),
  ])

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
}
