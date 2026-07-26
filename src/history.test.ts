import { beforeEach, describe, expect, it } from 'vitest'
import { addTrip, clearTrips, loadTrips, tripStats, whenLabel } from './history'
import type { TripRecord } from './history'

const trip = (over: Partial<TripRecord> = {}): TripRecord => ({
  id: '1',
  at: '2026-07-24T08:00:00Z',
  from: 'Olympiapark',
  to: 'Marienplatz',
  seconds: 1800,
  legs: 3,
  bikeMinutes: 12,
  electric: false,
  ...over,
})

describe('tripStats', () => {
  it('summiert Fahrten, Zeit und Radminuten', () => {
    const s = tripStats([trip(), trip({ seconds: 600, bikeMinutes: 8 })])
    expect(s.count).toBe(2)
    expect(s.minutes).toBe(40) // 30 + 10
    expect(s.bikeMinutes).toBe(20)
  })

  it('rechnet gesparte Euro pro angefangener halber Stunde', () => {
    expect(tripStats([trip({ bikeMinutes: 12 })]).savedEuro).toBe(1)
    expect(tripStats([trip({ bikeMinutes: 35 })]).savedEuro).toBe(2)
  })

  it('zählt E-Bike-Fahrten nicht als gespart — die kosten immer', () => {
    expect(tripStats([trip({ bikeMinutes: 20, electric: true })]).savedEuro).toBe(0)
  })

  it('zählt reine ÖPNV-Fahrten ohne Rad nicht mit', () => {
    expect(tripStats([trip({ bikeMinutes: 0 })]).savedEuro).toBe(0)
  })

  it('kommt mit leerer Liste klar', () => {
    expect(tripStats([])).toEqual({ count: 0, minutes: 0, bikeMinutes: 0, savedEuro: 0, calories: 0, co2Grams: 0 })
  })
})

describe('Speicher', () => {
  beforeEach(() => clearTrips())

  it('legt neue Fahrten oben ab', () => {
    addTrip({ from: 'A', to: 'B', seconds: 100, legs: 2, bikeMinutes: 5, electric: false })
    const list = addTrip({ from: 'C', to: 'D', seconds: 200, legs: 1, bikeMinutes: 0, electric: false })
    expect(list[0].from).toBe('C')
    expect(loadTrips()).toHaveLength(2)
  })

  it('liefert [] bei kaputtem Speicher statt zu werfen', () => {
    localStorage.setItem('radl.trips', '{kaputt')
    expect(loadTrips()).toEqual([])
  })
})

describe('whenLabel', () => {
  const now = new Date('2026-07-24T12:00:00Z').getTime()

  it('zeigt Minuten für frische Fahrten', () => {
    expect(whenLabel('2026-07-24T11:45:00Z', now)).toBe('vor 15 Min')
  })

  it('markiert heute und gestern', () => {
    expect(whenLabel('2026-07-24T06:00:00Z', now)).toContain('heute')
    expect(whenLabel('2026-07-23T18:00:00Z', now)).toContain('gestern')
  })

  it('fällt bei älteren Fahrten auf das Datum zurück', () => {
    expect(whenLabel('2026-07-12T09:00:00Z', now)).toMatch(/12\.07/)
  })
})
