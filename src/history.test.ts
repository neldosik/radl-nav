import { beforeEach, describe, expect, it } from 'vitest'
import {
  addTrip,
  clearTrips,
  exactWhen,
  loadTrips,
  removeTrip,
  tripStats,
  weeklyAverage,
  weeklyChartData,
  whenLabel,
} from './history'
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

  it('rechnet gespart = Preis ohne Abo minus Preis mit Abo', () => {
    // 12 Min: ohne Abo 1 €, mit Abo frei → 1 € gespart
    expect(tripStats([trip({ bikeMinutes: 12 })]).savedEuro).toBe(1)
    // 35 Min: ohne Abo 2 €, mit Abo 1 € (5 Min über der Freizeit) → 1 € gespart.
    // Vorher stand hier 2 € — die Zuzahlung nach den Freiminuten fehlte.
    expect(tripStats([trip({ bikeMinutes: 35 })]).savedEuro).toBe(1)
  })

  it('zählt E-Bike-Fahrten nicht als gespart — die kosten immer', () => {
    expect(tripStats([trip({ bikeMinutes: 20, electric: true })]).savedEuro).toBe(0)
  })

  it('zählt reine ÖPNV-Fahrten ohne Rad nicht mit', () => {
    expect(tripStats([trip({ bikeMinutes: 0 })]).savedEuro).toBe(0)
  })

  it('kommt mit leerer Liste klar', () => {
    expect(tripStats([])).toEqual({
      count: 0,
      minutes: 0,
      bikeMinutes: 0,
      bikeKm: 0,
      savedEuro: 0,
      calories: 0,
      co2Grams: 0,
    })
  })

  it('summiert die Radkilometer und schätzt sie für alte Einträge', () => {
    // Neue Fahrten bringen die Strecke mit …
    expect(tripStats([trip({ bikeKm: 4.2 })]).bikeKm).toBe(4.2)
    // … alte kennen nur Minuten: 20 Min bei 15 km/h ≈ 5 km
    expect(tripStats([trip({ bikeMinutes: 20, bikeKm: undefined })]).bikeKm).toBe(5)
  })

  it('rechnet E-Bike-Minuten mit dem niedrigeren Kalorienwert', () => {
    const klassisch = tripStats([trip({ bikeMinutes: 30, electric: false })]).calories
    const pedelec = tripStats([trip({ bikeMinutes: 30, electric: true })]).calories
    expect(pedelec).toBeLessThan(klassisch)
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

  it('löscht einzelne Fahrten und lässt die übrigen stehen', () => {
    addTrip({ from: 'A', to: 'B', seconds: 100, legs: 2, bikeMinutes: 5, electric: false })
    const list = addTrip({ from: 'C', to: 'D', seconds: 200, legs: 1, bikeMinutes: 0, electric: false })
    const rest = removeTrip(list[0].id)
    expect(rest).toHaveLength(1)
    expect(rest[0].from).toBe('A')
    expect(loadTrips()).toHaveLength(1)
  })

  it('ignoriert unbekannte Kennungen beim Löschen', () => {
    addTrip({ from: 'A', to: 'B', seconds: 100, legs: 2, bikeMinutes: 5, electric: false })
    expect(removeTrip('gibt-es-nicht')).toHaveLength(1)
  })

  it('vergibt auch in derselben Millisekunde verschiedene Kennungen', () => {
    addTrip({ from: 'A', to: 'B', seconds: 100, legs: 2, bikeMinutes: 5, electric: false })
    const list = addTrip({ from: 'C', to: 'D', seconds: 200, legs: 1, bikeMinutes: 0, electric: false })
    expect(list[0].id).not.toBe(list[1].id)
  })
})

describe('weeklyChartData', () => {
  // Freitag, 24.07.2026, 12:00 Ortszeit
  const now = new Date(2026, 6, 24, 12, 0, 0).getTime()
  const at = (d: Date) => d.toISOString()

  it('legt Radminuten auf den passenden Wochentag', () => {
    const chart = weeklyChartData([trip({ at: at(new Date(2026, 6, 24, 9, 0)), bikeMinutes: 12 })], now)
    expect(chart.find(c => c.day === 'Fr')?.mins).toBe(12)
    expect(chart.find(c => c.day === 'Mo')?.mins).toBe(0)
  })

  it('zählt denselben Wochentag der Vorwoche nicht mit', () => {
    // genau sieben Tage zurück, aber später am Tag — lag früher im Fenster
    const chart = weeklyChartData([trip({ at: at(new Date(2026, 6, 17, 15, 0)), bikeMinutes: 40 })], now)
    expect(chart.find(c => c.day === 'Fr')?.mins).toBe(0)
  })

  it('summiert mehrere Fahrten am selben Tag', () => {
    const chart = weeklyChartData(
      [
        trip({ at: at(new Date(2026, 6, 22, 8, 0)), bikeMinutes: 10 }),
        trip({ at: at(new Date(2026, 6, 22, 18, 0)), bikeMinutes: 5 }),
      ],
      now,
    )
    expect(chart.find(c => c.day === 'Mi')?.mins).toBe(15)
  })
})

describe('weeklyAverage', () => {
  it('teilt die Radminuten auf sieben Tage auf', () => {
    expect(weeklyAverage([{ day: 'Mo', mins: 70 }])).toBe(70)
    const week = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((day, i) => ({ day, mins: i === 0 ? 70 : 0 }))
    expect(weeklyAverage(week)).toBe(10)
  })

  it('ist 0 ohne Daten', () => {
    expect(weeklyAverage([])).toBe(0)
  })
})

describe('exactWhen', () => {
  it('zeigt Datum und Uhrzeit', () => {
    const s = exactWhen(new Date(2026, 6, 12, 14, 35).toISOString())
    expect(s).toMatch(/12\.07\.2026/)
    expect(s).toMatch(/14:35/)
  })

  it('bleibt bei Unsinn leer statt „Invalid Date"', () => {
    expect(exactWhen('kein-datum')).toBe('')
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
