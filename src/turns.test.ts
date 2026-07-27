import { describe, expect, it } from 'vitest'
import { angleDiff, bearing, nextTurn, turnsFromPath } from './turns'
import type { LatLon } from './types'

/** Punkt in Metern relativ zu einem Ursprung — leichter zu lesen als Grade. */
const O = { lat: 48.14, lon: 11.57 }
const p = (ostM: number, nordM: number): LatLon => ({
  lat: O.lat + nordM / 110540,
  lon: O.lon + ostM / (Math.cos((O.lat * Math.PI) / 180) * 111320),
})

describe('bearing', () => {
  it('zeigt nach Norden mit 0°', () => {
    expect(bearing(p(0, 0), p(0, 100))).toBeCloseTo(0, 0)
  })

  it('zeigt nach Osten mit 90°', () => {
    expect(bearing(p(0, 0), p(100, 0))).toBeCloseTo(90, 0)
  })

  it('zeigt nach Süden mit 180°', () => {
    expect(Math.abs(bearing(p(0, 0), p(0, -100)))).toBeCloseTo(180, 0)
  })
})

describe('angleDiff', () => {
  it('ist positiv beim Rechtsschwenk', () => {
    expect(angleDiff(0, 90)).toBe(90)
  })

  it('ist negativ beim Linksschwenk', () => {
    expect(angleDiff(0, -90)).toBe(-90)
  })

  it('läuft sauber über den Nordpunkt', () => {
    expect(angleDiff(350, 10)).toBe(20)
    expect(angleDiff(10, 350)).toBe(-20)
  })
})

describe('turnsFromPath', () => {
  it('findet auf einer Geraden keine Abbiegung', () => {
    const gerade = [p(0, 0), p(0, 100), p(0, 200), p(0, 300)]
    expect(turnsFromPath(gerade)).toEqual([])
  })

  it('erkennt eine Rechtskurve', () => {
    // 100 m nach Norden, dann 100 m nach Osten
    const weg = [p(0, 0), p(0, 100), p(100, 100)]
    const t = turnsFromPath(weg)
    expect(t).toHaveLength(1)
    expect(t[0].kind).toBe('right')
    expect(t[0].angle).toBeCloseTo(90, 0)
    expect(t[0].at).toBeCloseTo(100, -1)
  })

  it('erkennt eine Linkskurve', () => {
    const weg = [p(0, 0), p(0, 100), p(-100, 100)]
    expect(turnsFromPath(weg)[0].kind).toBe('left')
  })

  it('unterscheidet leichte, normale und scharfe Abbiegungen', () => {
    // 45° — über der Schwelle von 35°, aber unter den 60° einer vollen Abbiegung
    const leicht = turnsFromPath([p(0, 0), p(0, 100), p(80, 180)])
    expect(leicht[0].kind).toBe('slight-right')

    const scharf = turnsFromPath([p(0, 0), p(0, 100), p(-60, 40)])
    expect(scharf[0].kind).toBe('sharp-left')
  })

  it('macht aus einem leichten Straßenbogen keine Abbiegung', () => {
    // rund 20° — unter der Schwelle von 35°
    const bogen = [p(0, 0), p(0, 100), p(36, 200)]
    expect(turnsFromPath(bogen)).toEqual([])
  })

  it('fasst zwei dicht beieinander liegende Knicke zu einer Kurve zusammen', () => {
    const weg = [p(0, 0), p(0, 100), p(15, 108), p(100, 115)]
    expect(turnsFromPath(weg)).toHaveLength(1)
  })

  it('kommt mit zu kurzen Linien klar', () => {
    expect(turnsFromPath([])).toEqual([])
    expect(turnsFromPath([p(0, 0), p(0, 50)])).toEqual([])
  })
})

describe('nextTurn', () => {
  const turns = turnsFromPath([p(0, 0), p(0, 200), p(200, 200), p(200, 400)])

  it('nennt die nächste Abbiegung samt Entfernung', () => {
    expect(turns.length).toBeGreaterThanOrEqual(2)
    const n = nextTurn(turns, 50)!
    expect(n.kind).toBe('right')
    expect(n.inM).toBeCloseTo(150, -1)
  })

  it('überspringt bereits passierte Abbiegungen', () => {
    const n = nextTurn(turns, 250)!
    expect(n.at).toBeGreaterThan(250)
  })

  it('gibt null zurück, wenn nichts mehr kommt', () => {
    expect(nextTurn(turns, 10_000)).toBeNull()
  })
})
