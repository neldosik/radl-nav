import { describe, expect, it } from 'vitest'
import { clusterFreeBikes, haversine, nearbyStations, nearestStation, planPickup } from './geo'
import type { FreeBike, Station } from './types'

const station = (id: string, lat: number, lon: number, bikes: number, ebikes = 0): Station => ({
  id,
  name: id,
  lat,
  lon,
  bikes,
  ebikes,
  docks: null,
})

const MARIENPLATZ = { lat: 48.1374, lon: 11.5755 }

describe('haversine', () => {
  it('misst bekannte Distanz (Marienplatz → Odeonsplatz ≈ 900 m)', () => {
    const d = haversine(MARIENPLATZ, { lat: 48.1447, lon: 11.5776 })
    expect(d).toBeGreaterThan(750)
    expect(d).toBeLessThan(950)
  })

  it('ist 0 für denselben Punkt', () => {
    expect(haversine(MARIENPLATZ, MARIENPLATZ)).toBeCloseTo(0)
  })
})

describe('nearestStation', () => {
  const stations = [station('fern', 48.16, 11.6, 5), station('nah', 48.1376, 11.5756, 2)]

  it('findet die nächste Station', () => {
    expect(nearestStation(MARIENPLATZ, stations)?.id).toBe('nah')
  })

  it('gibt null zurück, wenn alles außerhalb des Radius liegt', () => {
    expect(nearestStation(MARIENPLATZ, [station('fern', 48.2, 11.7, 5)], 150)).toBeNull()
  })
})

describe('nearbyStations', () => {
  it('sortiert nach Entfernung und ignoriert leere Stationen', () => {
    const stations = [
      station('leer', 48.1375, 11.5756, 0), // keine Räder → raus
      station('mittel', 48.1385, 11.5755, 3),
      station('direkt', 48.1375, 11.5755, 1),
    ]
    expect(nearbyStations(MARIENPLATZ, stations, 600).map(n => n.station.id)).toEqual([
      'direkt',
      'mittel',
    ])
  })

  it('respektiert Radius und Limit', () => {
    const stations = [
      station('a', 48.1375, 11.5755, 1),
      station('b', 48.1376, 11.5755, 1),
      station('weit-weg', 48.2, 11.7, 9),
    ]
    const out = nearbyStations(MARIENPLATZ, stations, 600, 1)
    expect(out).toHaveLength(1)
    expect(out[0].station.id).toBe('a')
  })
})

describe('planPickup', () => {
  const nearby = [
    { station: station('A', 48.1375, 11.5755, 2, 1), dist: 50 },
    { station: station('B', 48.1385, 11.5755, 5, 0), dist: 200 },
  ]

  it('sammelt mehrere Räder über Stationen hinweg', () => {
    const pk = planPickup(nearby, false, 4)
    expect(pk.got).toBe(4)
    expect(pk.picks.map(p => [p.station.id, p.take])).toEqual([
      ['A', 2],
      ['B', 2],
    ])
  })

  it('nimmt alles von der nächsten Station, wenn es dort reicht', () => {
    const pk = planPickup(nearby, false, 2)
    expect(pk.picks).toHaveLength(1)
    expect(pk.picks[0].station.id).toBe('A')
  })

  it('meldet ehrlich zu wenige E-Bikes und zeigt die Alternative', () => {
    const pk = planPickup(nearby, true, 3)
    expect(pk.got).toBe(1) // nur 1 E-Bike in der Nähe
    expect(pk.totalElectric).toBe(1)
    expect(pk.totalClassic).toBe(7) // dafür 7 klassische
  })

  it('kommt ohne Stationen klar', () => {
    const pk = planPickup([], false, 2)
    expect(pk.got).toBe(0)
    expect(pk.picks).toEqual([])
  })
})

describe('clusterFreeBikes', () => {
  const bike = (id: string, lat: number, lon: number, electric = false): FreeBike => ({
    id,
    lat,
    lon,
    electric,
  })

  it('fasst nah beieinander stehende Räder zu einem Punkt zusammen', () => {
    const out = clusterFreeBikes([bike('a', 48.1374, 11.5755), bike('b', 48.13742, 11.57553)])
    expect(out).toHaveLength(1)
    expect(out[0].bikes).toBe(2)
    expect(out[0].name).toBe('Freie Räder')
  })

  it('trennt weit auseinander stehende Räder', () => {
    const out = clusterFreeBikes([bike('a', 48.1374, 11.5755), bike('b', 48.16, 11.61)])
    expect(out).toHaveLength(2)
    expect(out[0].name).toBe('Freies Rad')
  })

  it('zählt E-Bikes getrennt', () => {
    const out = clusterFreeBikes([
      bike('a', 48.1374, 11.5755),
      bike('e', 48.13741, 11.57551, true),
    ])
    expect(out[0].bikes).toBe(1)
    expect(out[0].ebikes).toBe(1)
  })
})
