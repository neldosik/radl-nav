import type { FreeBike, Station } from './types'

/**
 * Reine Parser für die GBFS-Feeds von MyRadl/nextbike — ohne Netzwerk, damit
 * die Zähl-Logik testbar bleibt. Hier steckten schon zwei echte Bugs:
 * doppelt gezählte Stationsräder und E-Bikes, die als Standardräder galten.
 */

export interface GbfsStationInfo {
  station_id: string
  name: string
  lat: number
  lon: number
  rental_uris?: { android?: string; ios?: string; web?: string }
}

export interface GbfsStationStatus {
  station_id: string
  num_bikes_available?: number
  num_docks_available?: number
  vehicle_types_available?: { vehicle_type_id: string; count: number }[]
}

export interface GbfsVehicleType {
  vehicle_type_id: string
  form_factor?: string
  propulsion_type?: string
}

export interface GbfsFreeBike {
  bike_id: string
  lat?: number
  lon?: number
  vehicle_type_id?: string
  is_reserved?: boolean
  is_disabled?: boolean
  /** gesetzt => Rad steht an einer Station und ist bereits in station_status enthalten */
  station_id?: string
  current_range_meters?: number
  battery_level?: number
  current_fuel_percent?: number
}

/** IDs aller Fahrzeugtypen mit Motor (propulsion_type != "human"). */
export function electricTypeIds(types: GbfsVehicleType[] | null | undefined): Set<string> {
  const out = new Set<string>()
  for (const vt of types ?? []) {
    if (vt.propulsion_type && vt.propulsion_type !== 'human') out.add(vt.vehicle_type_id)
  }
  return out
}

/**
 * Stationen mit getrennter Zählung: `bikes` = klassische Räder (30 Freiminuten),
 * `ebikes` = kostenpflichtige E-Bikes. num_bikes_available enthält beides.
 * E-Bike Akkus werden aus den echten GBFS-Raddaten berechnet (Maximalwert & Reichweite).
 */
export function parseStations(
  info: GbfsStationInfo[] | null | undefined,
  status: GbfsStationStatus[] | null | undefined,
  types: GbfsVehicleType[] | null | undefined,
  allBikes?: GbfsFreeBike[] | null,
): Station[] {
  if (!info || !status) return []
  const electric = electricTypeIds(types)
  const statusById = new Map<string, GbfsStationStatus>()
  for (const s of status) statusById.set(s.station_id, s)

  // Akku-Stände pro Station aus allen verfügbaren GBFS-Rädern sammeln
  const stationBikes = new Map<string, GbfsFreeBike[]>()
  for (const b of allBikes ?? []) {
    if (b.station_id && !b.is_disabled && !b.is_reserved) {
      let list = stationBikes.get(b.station_id)
      if (!list) {
        list = []
        stationBikes.set(b.station_id, list)
      }
      list.push(b)
    }
  }

  return info.map(si => {
    const st = statusById.get(si.station_id)
    let ebikes = 0
    for (const v of st?.vehicle_types_available ?? []) {
      if (electric.has(v.vehicle_type_id)) ebikes += v.count
    }
    const total = st?.num_bikes_available ?? 0

    // Echte Akku-Werte für E-Bikes an dieser Station auswerten
    const sBikes = stationBikes.get(si.station_id) ?? []
    const eBikesAtStation = sBikes.filter(b => b.vehicle_type_id && electric.has(b.vehicle_type_id))
    
    let maxBat: number | undefined = undefined
    let maxRange: number | undefined = undefined

    for (const eb of eBikesAtStation) {
      const rawBat = eb.current_fuel_percent ?? eb.battery_level
      if (rawBat != null) {
        const pct = Math.round(rawBat <= 1 ? rawBat * 100 : rawBat)
        if (maxBat == null || pct > maxBat) maxBat = pct
      }
      if (eb.current_range_meters != null) {
        const km = Math.round(eb.current_range_meters / 1000)
        if (maxRange == null || km > maxRange) maxRange = km
      }
    }

    if (maxBat != null && maxRange == null) {
      maxRange = Math.round((maxBat / 100) * 35)
    }

    return {
      id: si.station_id,
      name: si.name,
      lat: si.lat,
      lon: si.lon,
      rentalUris: si.rental_uris,
      bikes: Math.max(0, total - ebikes),
      ebikes,
      docks: st?.num_docks_available ?? null,
      maxChargePercent: maxBat,
      batteryPercent: maxBat,
      rangeKm: maxRange,
    }
  })
}

/**
 * Nur wirklich freistehende Räder. WICHTIG: free_bike_status enthält auch alle
 * Räder an Stationen (~4100 von ~4500 haben station_id) — ohne diesen Filter
 * würden sie doppelt gezählt.
 */
export function parseFreeBikes(
  bikes: GbfsFreeBike[] | null | undefined,
  types: GbfsVehicleType[] | null | undefined,
): FreeBike[] {
  if (!bikes) return []
  const electric = electricTypeIds(types)
  return bikes
    .filter(b => !b.station_id)
    .filter(b => !b.is_disabled && !b.is_reserved)
    .filter(b => typeof b.lat === 'number' && typeof b.lon === 'number')
    .map(b => {
      const isElec = !!b.vehicle_type_id && electric.has(b.vehicle_type_id)
      const rawBat = b.current_fuel_percent ?? b.battery_level
      const batteryPercent = rawBat != null ? Math.round(rawBat <= 1 ? rawBat * 100 : rawBat) : undefined
      const rangeKm = b.current_range_meters ? Math.round(b.current_range_meters / 1000) : (batteryPercent != null ? Math.round((batteryPercent / 100) * 35) : undefined)
      return {
        id: b.bike_id,
        lat: b.lat!,
        lon: b.lon!,
        electric: isElec,
        batteryPercent,
        rangeKm,
      }
    })
}
