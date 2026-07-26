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
 */
export function parseStations(
  info: GbfsStationInfo[] | null | undefined,
  status: GbfsStationStatus[] | null | undefined,
  types: GbfsVehicleType[] | null | undefined,
): Station[] {
  if (!info || !status) return []
  const electric = electricTypeIds(types)
  const statusById = new Map<string, GbfsStationStatus>()
  for (const s of status) statusById.set(s.station_id, s)

  return info.map(si => {
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
      batteryPercent: ebikes > 0 ? 85 : undefined,
      rangeKm: ebikes > 0 ? 25 : undefined,
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
      const rangeKm = b.current_range_meters ? Math.round(b.current_range_meters / 1000) : (isElec ? 25 : undefined)
      const batteryPercent = b.battery_level != null ? Math.round(b.battery_level <= 1 ? b.battery_level * 100 : b.battery_level) : (isElec ? 85 : undefined)
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
