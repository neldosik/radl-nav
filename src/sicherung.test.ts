import { beforeEach, describe, expect, it } from 'vitest'
import { addTrip, loadTrips } from './history'
import type { TripRecord } from './history'
import {
  dateiName,
  gpxErzeugen,
  sicherungEinlesen,
  sicherungErzeugen,
  sicherungLesen,
} from './sicherung'

const fahrt = (id: string, at: string): TripRecord => ({
  id,
  at,
  from: 'Marienplatz',
  to: 'Ostbahnhof',
  seconds: 900,
  legs: 3,
  bikeMinutes: 12,
  electric: false,
})

beforeEach(() => localStorage.clear())

describe('sicherungErzeugen', () => {
  it('nimmt die gespeicherten Fahrten mit Kennung auf', () => {
    addTrip({ from: 'A', to: 'B', seconds: 600, legs: 2, bikeMinutes: 8, bikeKm: 2, electric: false })
    const s = JSON.parse(sicherungErzeugen())
    expect(s.app).toBe('radl-navi')
    expect(s.version).toBe(1)
    expect(s.trips).toHaveLength(1)
    expect(s.trips[0].from).toBe('A')
  })
})

describe('sicherungLesen', () => {
  it('liest, was erzeugt wurde', () => {
    const text = sicherungErzeugen([fahrt('a', '2026-08-01T10:00:00.000Z')])
    const gelesen = sicherungLesen(text)
    expect(gelesen.ok && gelesen.trips).toHaveLength(1)
  })

  it('nimmt auch eine nackte Liste an', () => {
    const gelesen = sicherungLesen(JSON.stringify([fahrt('a', '2026-08-01T10:00:00.000Z')]))
    expect(gelesen.ok).toBe(true)
  })

  it('meldet kaputtes JSON als Formatfehler', () => {
    expect(sicherungLesen('{kaputt')).toEqual({ ok: false, grund: 'format' })
    expect(sicherungLesen('"nur ein Text"')).toEqual({ ok: false, grund: 'format' })
  })

  it('übergeht einzelne unbrauchbare Einträge', () => {
    const text = JSON.stringify({
      app: 'radl-navi',
      version: 1,
      trips: [fahrt('a', '2026-08-01T10:00:00.000Z'), { id: 'b' }, null],
    })
    const gelesen = sicherungLesen(text)
    expect(gelesen.ok && gelesen.trips.map(t => t.id)).toEqual(['a'])
  })

  it('meldet eine Datei ohne brauchbare Fahrt', () => {
    expect(sicherungLesen('{"trips":[{"id":"b"}]}')).toEqual({ ok: false, grund: 'leer' })
  })
})

describe('sicherungEinlesen', () => {
  it('führt zusammen, ohne bereits bekannte Fahrten zu verdoppeln', () => {
    const text = sicherungErzeugen([
      fahrt('a', '2026-08-01T10:00:00.000Z'),
      fahrt('b', '2026-08-02T10:00:00.000Z'),
    ])
    expect(sicherungEinlesen(text).added).toBe(2)
    expect(sicherungEinlesen(text).added).toBe(0)
    expect(loadTrips()).toHaveLength(2)
  })

  it('sortiert die jüngste Fahrt nach oben', () => {
    sicherungEinlesen(
      sicherungErzeugen([
        fahrt('alt', '2026-08-01T10:00:00.000Z'),
        fahrt('neu', '2026-08-20T10:00:00.000Z'),
      ]),
    )
    expect(loadTrips().map(t => t.id)).toEqual(['neu', 'alt'])
  })
})

describe('gpxErzeugen', () => {
  it('gibt ohne Spur nichts zurück', () => {
    expect(gpxErzeugen(fahrt('a', '2026-08-01T10:00:00.000Z'))).toBeNull()
    expect(
      gpxErzeugen({ ...fahrt('a', '2026-08-01T10:00:00.000Z'), track: [{ lat: 48, lon: 11 }] }),
    ).toBeNull()
  })

  it('schreibt die Punkte und schützt Sonderzeichen im Namen', () => {
    const gpx = gpxErzeugen({
      ...fahrt('a', '2026-08-01T10:00:00.000Z'),
      from: 'Fürst & Söhne',
      track: [
        { lat: 48.1374, lon: 11.5755 },
        { lat: 48.1272, lon: 11.6045 },
      ],
    })!
    expect(gpx).toContain('<trkpt lat="48.137400" lon="11.575500" />')
    expect(gpx).toContain('Fürst &amp; Söhne')
    expect(gpx).not.toContain('& S')
  })
})

describe('dateiName', () => {
  it('hängt das Datum an', () => {
    expect(dateiName('radl-fahrten', 'json', new Date('2026-08-28T12:00:00Z'))).toBe(
      'radl-fahrten-2026-08-28.json',
    )
  })
})
