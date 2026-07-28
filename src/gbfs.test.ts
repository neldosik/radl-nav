import { describe, expect, it } from 'vitest'
import { bestandAusStatus, electricTypeIds, parseFreeBikes, parseStations } from './gbfs'
import type { GbfsFreeBike, GbfsStationInfo, GbfsStationStatus, GbfsVehicleType } from './gbfs'

const TYPES: GbfsVehicleType[] = [
  { vehicle_type_id: 'classic', propulsion_type: 'human' },
  { vehicle_type_id: 'e', propulsion_type: 'electric_assist' },
]

const INFO: GbfsStationInfo[] = [{ station_id: 's1', name: 'Leonrodplatz', lat: 48.15, lon: 11.55 }]

describe('electricTypeIds', () => {
  it('erkennt nur Typen mit Motor', () => {
    expect([...electricTypeIds(TYPES)]).toEqual(['e'])
  })

  it('kommt mit fehlendem Feed klar', () => {
    expect(electricTypeIds(null).size).toBe(0)
  })
})

describe('parseStations', () => {
  it('trennt E-Bikes von klassischen Rädern (num_bikes_available enthält beide)', () => {
    const status: GbfsStationStatus[] = [
      {
        station_id: 's1',
        num_bikes_available: 11,
        vehicle_types_available: [
          { vehicle_type_id: 'classic', count: 3 },
          { vehicle_type_id: 'e', count: 8 },
        ],
      },
    ]
    const [s] = parseStations(INFO, status, TYPES)
    expect(s.bikes).toBe(3) // nur die kostenlosen
    expect(s.ebikes).toBe(8)
  })

  it('meldet 0 klassische Räder, wenn nur E-Bikes dastehen', () => {
    // echter Fall „Wiesentfelser Straße Ost": 11 Räder, alle elektrisch
    const status: GbfsStationStatus[] = [
      {
        station_id: 's1',
        num_bikes_available: 11,
        vehicle_types_available: [{ vehicle_type_id: 'e', count: 11 }],
      },
    ]
    const [s] = parseStations(INFO, status, TYPES)
    expect(s.bikes).toBe(0)
    expect(s.ebikes).toBe(11)
  })

  it('zählt ohne Typ-Aufschlüsselung alles als klassisch', () => {
    const status: GbfsStationStatus[] = [{ station_id: 's1', num_bikes_available: 4 }]
    const [s] = parseStations(INFO, status, TYPES)
    expect(s.bikes).toBe(4)
    expect(s.ebikes).toBe(0)
  })

  it('setzt Station ohne Status auf 0', () => {
    const [s] = parseStations(INFO, [], TYPES)
    expect(s.bikes).toBe(0)
    expect(s.docks).toBeNull()
  })

  it('liefert [] bei fehlenden Feeds statt zu werfen', () => {
    expect(parseStations(null, null, TYPES)).toEqual([])
  })
})

describe('parseFreeBikes', () => {
  it('ignoriert Räder an Stationen — sonst doppelte Zählung', () => {
    // Kernbug: free_bike_status enthält auch alle Stationsräder (station_id gesetzt)
    const bikes: GbfsFreeBike[] = [
      { bike_id: 'a', lat: 48.1, lon: 11.5, station_id: 's1' },
      { bike_id: 'b', lat: 48.1, lon: 11.5 },
    ]
    const out = parseFreeBikes(bikes, TYPES)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('b')
  })

  it('filtert reservierte und defekte Räder', () => {
    const bikes: GbfsFreeBike[] = [
      { bike_id: 'a', lat: 48.1, lon: 11.5, is_reserved: true },
      { bike_id: 'b', lat: 48.1, lon: 11.5, is_disabled: true },
      { bike_id: 'c', lat: 48.1, lon: 11.5 },
    ]
    expect(parseFreeBikes(bikes, TYPES).map(b => b.id)).toEqual(['c'])
  })

  it('markiert E-Bikes und braucht Koordinaten', () => {
    const bikes: GbfsFreeBike[] = [
      { bike_id: 'e1', lat: 48.1, lon: 11.5, vehicle_type_id: 'e' },
      { bike_id: 'ohne-koordinaten', vehicle_type_id: 'classic' },
    ]
    const out = parseFreeBikes(bikes, TYPES)
    expect(out).toHaveLength(1)
    expect(out[0].electric).toBe(true)
  })
})

describe('parseStations · Mietlinks', () => {
  it('reicht rental_uris aus station_information durch', () => {
    const info: GbfsStationInfo[] = [
      {
        station_id: 's1',
        name: 'Leonrodplatz',
        lat: 48.15,
        lon: 11.55,
        rental_uris: {
          android: 'https://app.nextbike.net/station?id=s1',
          ios: 'https://app.nextbike.net/station?id=s1',
          web: 'https://nxtb.it/p/s1',
        },
      },
    ]
    const status: GbfsStationStatus[] = [{ station_id: 's1', num_bikes_available: 4 }]
    const [st] = parseStations(info, status, TYPES)
    expect(st.rentalUris?.android).toBe('https://app.nextbike.net/station?id=s1')
    expect(st.rentalUris?.web).toBe('https://nxtb.it/p/s1')
  })

  it('bleibt ohne rental_uris undefined statt zu werfen', () => {
    const status: GbfsStationStatus[] = [{ station_id: 's1', num_bikes_available: 4 }]
    expect(parseStations(INFO, status, TYPES)[0].rentalUris).toBeUndefined()
  })
})

describe('bestandAusStatus — Radzahl einer einzelnen Station', () => {
  const types = [
    { vehicle_type_id: 'bike', propulsion_type: 'human' },
    { vehicle_type_id: 'ebike', propulsion_type: 'electric_assist' },
  ]
  const status = [
    {
      station_id: 'A',
      num_bikes_available: 5,
      vehicle_types_available: [
        { vehicle_type_id: 'bike', count: 3 },
        { vehicle_type_id: 'ebike', count: 2 },
      ],
    },
    { station_id: 'B', num_bikes_available: 0, vehicle_types_available: [] },
  ]

  it('trennt klassische Räder von E-Bikes', () => {
    expect(bestandAusStatus(status as never, types as never, 'A')).toEqual({ bikes: 3, ebikes: 2 })
  })

  it('meldet eine leere Station als leer, nicht als unbekannt', () => {
    expect(bestandAusStatus(status as never, types as never, 'B')).toEqual({ bikes: 0, ebikes: 0 })
  })

  it('gibt null für eine unbekannte Station', () => {
    expect(bestandAusStatus(status as never, types as never, 'gibtsnicht')).toBeNull()
  })

  it('zählt ohne Typdaten alles als klassisch — wie parseStations auch', () => {
    expect(bestandAusStatus(status as never, [], 'A')).toEqual({ bikes: 5, ebikes: 0 })
    expect(bestandAusStatus(status as never, null, 'A')).toEqual({ bikes: 5, ebikes: 0 })
  })

  it('lässt die Radzahl nie unter null rutschen', () => {
    // Widersprüchlicher Feed: mehr E-Bikes aufgezählt als Räder gemeldet.
    const kaputt = [
      { station_id: 'C', num_bikes_available: 1, vehicle_types_available: [{ vehicle_type_id: 'ebike', count: 4 }] },
    ]
    expect(bestandAusStatus(kaputt as never, types as never, 'C')?.bikes).toBe(0)
  })
})
