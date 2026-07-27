import { describe, expect, it } from 'vitest'
import { co2Label, euro, legCostCent, legKcal, rideLegsOf, rideStats } from './stats'
import type { BikeLegInfo, ItineraryView, Leg } from './types'

describe('legKcal — Pedelec zählt weniger', () => {
  it('rechnet Standardrad nach MET 6.8', () => {
    // 6.8 × 75 kg × 0.5 h = 255 kcal
    expect(legKcal(30, false, 75)).toBe(255)
  })

  it('rechnet E-Bike deutlich niedriger als das Standardrad', () => {
    const classic = legKcal(30, false, 75)
    const ebike = legKcal(30, true, 75)
    expect(ebike).toBeLessThan(classic)
    // MET 4.9 / 6.8 ≈ 0.72
    expect(ebike / classic).toBeCloseTo(4.9 / 6.8, 2)
  })

  it('skaliert mit der echten Dauer statt pauschal', () => {
    expect(legKcal(40, false, 75)).toBe(legKcal(20, false, 75) * 2)
  })

  it('berücksichtigt das Körpergewicht', () => {
    expect(legKcal(30, false, 100)).toBeGreaterThan(legKcal(30, false, 60))
  })
})

describe('legCostCent — Abo-Preise MyRadl', () => {
  it('lässt das Standardrad in den ersten 30 Minuten frei', () => {
    expect(legCostCent(28, false)).toBe(0)
    expect(legCostCent(30, false)).toBe(0)
  })

  it('rechnet nach den Freiminuten 1 € je angefangene halbe Stunde', () => {
    expect(legCostCent(31, false)).toBe(100)
    expect(legCostCent(60, false)).toBe(100)
    expect(legCostCent(61, false)).toBe(200)
  })

  it('lässt das E-Bike ab der ersten Minute kosten', () => {
    expect(legCostCent(5, true)).toBe(150)
    expect(legCostCent(31, true)).toBe(300)
  })

  it('ist bei Nullminuten kostenlos', () => {
    expect(legCostCent(0, false)).toBe(0)
    expect(legCostCent(0, true)).toBe(0)
  })
})

describe('rideStats', () => {
  it('trennt E-Bike-Minuten von Standardminuten', () => {
    const s = rideStats([
      { minutes: 20, km: 5, electric: false },
      { minutes: 10, km: 3, electric: true },
    ])
    expect(s.bikeMinutes).toBe(30)
    expect(s.electricMinutes).toBe(10)
    expect(s.bikeKm).toBe(8)
    expect(s.kcal).toBe(legKcal(20, false) + legKcal(10, true))
    expect(s.costCent).toBe(150) // Standardrad frei, E-Bike 1,50 €
  })

  it('rechnet CO₂ über die Strecke, nicht über die Minuten', () => {
    const langsam = rideStats([{ minutes: 40, km: 5, electric: false }])
    const schnell = rideStats([{ minutes: 15, km: 5, electric: false }])
    expect(langsam.co2Grams).toBe(schnell.co2Grams)
    expect(schnell.co2Grams).toBe(Math.round(5 * (148 - 5)))
  })

  it('kappt die Kosten bei der Tagesgrenze von 9 €', () => {
    expect(rideStats([{ minutes: 600, km: 40, electric: true }]).costCent).toBe(900)
  })

  it('bleibt bei leerer Liste bei null', () => {
    const s = rideStats([])
    expect(s).toEqual({ bikeMinutes: 0, electricMinutes: 0, bikeKm: 0, kcal: 0, co2Grams: 0, costCent: 0 })
  })
})

describe('rideLegsOf', () => {
  const bikeInfo = (over: Partial<BikeLegInfo> = {}): BikeLegInfo => ({
    startStation: null,
    endStation: null,
    tooLong: false,
    electric: false,
    freeFloating: false,
    returnSnapped: false,
    returnDetourM: 0,
    returnDetourSec: 0,
    noReturnStation: false,
    swapStation: null,
    nearby: [],
    ...over,
  })

  const leg = (over: Partial<Leg> = {}): Leg => ({
    mode: 'RENTAL',
    from: { name: 'A', lat: 48.15, lon: 11.55 },
    to: { name: 'B', lat: 48.16, lon: 11.56 },
    duration: 600,
    distance: 2500,
    startTime: '2026-07-24T08:00:00Z',
    endTime: '2026-07-24T08:10:00Z',
    ...over,
  })

  const view = (legs: Leg[], bikeLegs: Map<number, BikeLegInfo>): ItineraryView => ({
    it: { duration: 600, startTime: '', endTime: '', transfers: 0, legs },
    hasBike: true,
    warnLong: false,
    hasElectric: false,
    warnReturn: false,
    extraSec: 0,
    bikeLegs,
  })

  it('nimmt die echte Dauer und Länge der Etappe', () => {
    const v = view([leg()], new Map([[0, bikeInfo()]]))
    expect(rideLegsOf(v)).toEqual([{ minutes: 10, km: 2.5, electric: false }])
  })

  it('schlägt den Umweg zur Rückgabestation auf', () => {
    const info = bikeInfo({ returnSnapped: true, returnDetourM: 300, returnDetourSec: 71 })
    const [r] = rideLegsOf(view([leg()], new Map([[0, info]])))
    expect(r.minutes).toBe(11) // 600 s + 71 s
    expect(r.km).toBeCloseTo(2.8, 5)
  })

  it('schätzt die Länge, wenn MOTIS keine liefert', () => {
    const [r] = rideLegsOf(view([leg({ distance: undefined })], new Map([[0, bikeInfo()]])))
    expect(r.km).toBeCloseTo(2.5, 1) // 10 Min bei 15 km/h
  })
})

describe('Formatierung', () => {
  it('schreibt Euro deutsch', () => {
    expect(euro(0)).toBe('0 €')
    expect(euro(150)).toBe('1,50 €')
  })

  it('wechselt bei CO₂ ab einem Kilo die Einheit', () => {
    expect(co2Label(380)).toBe('380 g')
    expect(co2Label(1240)).toBe('1,2 kg')
  })
})
