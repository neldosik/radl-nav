import { describe, expect, it } from 'vitest'
import { buildView, itinerarySignature, legPath, legTarget, returnsToStation, viewDuration, viewEndTime } from './routing'
import type { Itinerary, ItineraryView, Leg, Station } from './types'

const station = (id: string, lat: number, lon: number, bikes = 5): Station => ({
  id,
  name: id,
  lat,
  lon,
  bikes,
  ebikes: 0,
  docks: null,
})

const START = { lat: 48.15, lon: 11.55 }
const END = { lat: 48.16, lon: 11.56 }

const bikeLeg = (over: Partial<Leg> = {}): Leg => ({
  mode: 'RENTAL',
  from: { name: 'Start', ...START },
  to: { name: 'Ziel', ...END },
  duration: 10 * 60,
  startTime: '2026-07-24T08:00:00Z',
  endTime: '2026-07-24T08:10:00Z',
  rental: { systemId: 'nextbike_ml', systemName: 'MyRadl ', fromStationName: 'A', propulsionType: 'HUMAN' },
  ...over,
})

const route = (legs: Leg[]): Itinerary => ({
  duration: legs.reduce((n, l) => n + l.duration, 0),
  startTime: '2026-07-24T08:00:00Z',
  endTime: '2026-07-24T08:30:00Z',
  transfers: 0,
  legs,
})

const stations = [station('A', 48.15, 11.55), station('B', 48.16, 11.56)]
const opts = { stations, supply: stations, maxBikeSec: 20 * 60, classicOnly: true }

describe('buildView — Filterregeln', () => {
  it('nimmt eine normale MyRadl-Etappe an', () => {
    const v = buildView(route([bikeLeg()]), opts)
    expect(v).not.toBeNull()
    expect(v!.hasBike).toBe(true)
    expect(v!.bikeLegs.get(0)?.startStation?.id).toBe('A')
    expect(v!.bikeLegs.get(0)?.endStation?.id).toBe('B')
  })

  it('verwirft fremde Anbieter (Dott), weil sie kostenpflichtig sind', () => {
    const dott = bikeLeg({ rental: { systemId: 'dott-munich', systemName: 'Dott munich' } })
    expect(buildView(route([dott]), opts)).toBeNull()
  })

  it('verwirft Routen über dem Radzeit-Limit des Nutzers', () => {
    const long = bikeLeg({ duration: 25 * 60 })
    expect(buildView(route([long]), opts)).toBeNull()
    // mit höherem Limit wieder erlaubt
    expect(buildView(route([long]), { ...opts, maxBikeSec: 30 * 60 })).not.toBeNull()
  })

  it('verwirft E-Bikes im Standard-Modus, erlaubt sie im E-Bike-Modus', () => {
    const e = bikeLeg({
      rental: { systemId: 'nextbike_ml', fromStationName: 'A', propulsionType: 'ELECTRIC_ASSIST' },
    })
    expect(buildView(route([e]), opts)).toBeNull()
    const v = buildView(route([e]), { ...opts, classicOnly: false })
    expect(v!.hasElectric).toBe(true)
    expect(v!.bikeLegs.get(0)?.electric).toBe(true)
  })

  it('behält reine ÖPNV-Routen ohne Radetappe', () => {
    const bus: Leg = { ...bikeLeg(), mode: 'BUS', rental: undefined, routeShortName: '63' }
    const v = buildView(route([bus]), opts)
    expect(v!.hasBike).toBe(false)
    expect(v!.bikeLegs.size).toBe(0)
  })
})

describe('buildView — Freiminuten', () => {
  it('warnt erst jenseits von 28 Minuten', () => {
    const knapp = buildView(route([bikeLeg({ duration: 27 * 60 })]), { ...opts, maxBikeSec: 45 * 60 })
    expect(knapp!.warnLong).toBe(false)

    const zuLang = buildView(route([bikeLeg({ duration: 29 * 60 })]), { ...opts, maxBikeSec: 45 * 60 })
    expect(zuLang!.warnLong).toBe(true)
    expect(zuLang!.bikeLegs.get(0)?.tooLong).toBe(true)
  })

  it('warnt bei E-Bikes nicht — dort gibt es ohnehin keine Freiminuten', () => {
    const e = bikeLeg({
      duration: 40 * 60,
      rental: { systemId: 'nextbike_ml', fromStationName: 'A', propulsionType: 'ELECTRIC_ASSIST' },
    })
    const v = buildView(route([e]), { ...opts, classicOnly: false, maxBikeSec: 45 * 60 })
    expect(v!.bikeLegs.get(0)?.tooLong).toBe(false)
  })

  it('markiert freistehende Räder (ohne Startstation)', () => {
    const free = bikeLeg({ rental: { systemId: 'nextbike_ml', propulsionType: 'HUMAN' } })
    const v = buildView(route([free]), opts)
    expect(v!.bikeLegs.get(0)?.freeFloating).toBe(true)
    expect(v!.bikeLegs.get(0)?.startStation).toBeNull()
  })
})

/**
 * MyRadl erlaubt die Rückgabe nur an Stationen (sonst 20 €). MOTIS meldet für
 * freistehende Räder `returnConstraint: NONE` und beendet die Etappe dann am
 * nächsten anderen freien Rad — die App führte genau dorthin.
 */
describe('Rückgabe nur an Stationen', () => {
  const rental = (over: Record<string, unknown> = {}) => ({
    systemId: 'nextbike_ml',
    propulsionType: 'HUMAN',
    ...over,
  })

  it('erkennt die Rückgabebedingung von MOTIS', () => {
    expect(returnsToStation(bikeLeg({ rental: rental({ returnConstraint: 'ANY_STATION' }) }))).toBe(true)
    expect(returnsToStation(bikeLeg({ rental: rental({ returnConstraint: 'ROUNDTRIP_STATION' }) }))).toBe(true)
    expect(returnsToStation(bikeLeg({ rental: rental({ returnConstraint: 'NONE' }) }))).toBe(false)
    // ohne das Feld: Stationsname am Ende als Ersatzsignal
    expect(returnsToStation(bikeLeg({ rental: rental({ toStationName: 'B' }) }))).toBe(true)
    expect(returnsToStation(bikeLeg({ rental: rental() }))).toBe(false)
  })

  // Station rund 300 m hinter dem von MOTIS gewählten Abstellpunkt
  const near = station('C', END.lat + 0.0027, END.lon)
  const freeDrop = bikeLeg({ rental: rental({ fromStationName: 'A', returnConstraint: 'NONE' }) })

  it('biegt ein freies Etappenende auf die nächste echte Station um', () => {
    const v = buildView(route([freeDrop]), { ...opts, stations: [stations[0], near], supply: [] })!
    const b = v.bikeLegs.get(0)!
    expect(b.returnSnapped).toBe(true)
    expect(b.endStation?.id).toBe('C')
    expect(b.returnDetourM).toBeGreaterThan(250)
    expect(b.returnDetourM).toBeLessThan(350)
    expect(b.noReturnStation).toBe(false)
  })

  it('navigiert zur Station statt zum MOTIS-Punkt', () => {
    const v = buildView(route([freeDrop]), { ...opts, stations: [stations[0], near], supply: [] })!
    expect(legTarget(v, 0)).toEqual({ name: 'C', lat: near.lat, lon: near.lon })
  })

  it('zieht die Linie bis zur Station weiter, nicht nur das Ziel', () => {
    const v = buildView(route([freeDrop]), { ...opts, stations: [stations[0], near], supply: [] })!
    const pfad = legPath(v, 0)
    const letzter = pfad[pfad.length - 1]
    // Sonst enden Karte, Restzeit und Abbiegehinweise vor dem eigentlichen Ziel
    expect(letzter.lat).toBeCloseTo(near.lat, 6)
    expect(letzter.lon).toBeCloseTo(near.lon, 6)
    expect(pfad.length).toBeGreaterThanOrEqual(2)
  })

  it('lässt die Linie unangetastet, wenn ohnehin an einer Station zurückgegeben wird', () => {
    const stationsRueckgabe = bikeLeg({
      rental: rental({ fromStationName: 'A', toStationName: 'B', returnConstraint: 'ROUNDTRIP_STATION' }),
    })
    const v = buildView(route([stationsRueckgabe]), { ...opts, stations, supply: [] })!
    const pfad = legPath(v, 0)
    const letzter = pfad[pfad.length - 1]
    expect(letzter.lat).toBeCloseTo(END.lat, 6)
    expect(letzter.lon).toBeCloseTo(END.lon, 6)
  })

  it('schiebt auch die Ankunftszeit um den Umweg nach hinten', () => {
    const v = buildView(route([freeDrop]), { ...opts, stations: [stations[0], near], supply: [] })!
    const roh = +new Date(v.it.endTime)
    const korrigiert = +new Date(viewEndTime(v))
    // Sonst zeigt die Karte eine längere Dauer und dieselbe Ankunft wie zuvor.
    expect(korrigiert - roh).toBe(v.extraSec * 1000)
  })

  it('lässt die Ankunftszeit unverändert, wenn es keinen Umweg gibt', () => {
    const atStation = bikeLeg({
      rental: rental({ fromStationName: 'A', toStationName: 'B', returnConstraint: 'ANY_STATION' }),
    })
    const v = buildView(route([atStation]), opts)!
    expect(viewEndTime(v)).toBe(v.it.endTime)
  })

  it('rechnet den Umweg in die Fahrtdauer ein', () => {
    const v = buildView(route([freeDrop]), { ...opts, stations: [stations[0], near], supply: [] })!
    expect(v.extraSec).toBeGreaterThan(0)
    expect(viewDuration(v)).toBe(v.it.duration + v.extraSec)
  })

  it('lässt Etappen in Ruhe, die ohnehin an einer Station enden', () => {
    const atStation = bikeLeg({
      rental: rental({ fromStationName: 'A', toStationName: 'B', returnConstraint: 'ANY_STATION' }),
    })
    const b = buildView(route([atStation]), opts)!.bikeLegs.get(0)!
    expect(b.returnSnapped).toBe(false)
    expect(b.returnDetourM).toBe(0)
    expect(b.endStation?.id).toBe('B')
  })

  it('markiert Routen ohne Rückgabestation in Reichweite', () => {
    const weit = [station('Fern', 48.3, 11.9)]
    const v = buildView(route([freeDrop]), { ...opts, stations: weit, supply: [] })!
    expect(v.bikeLegs.get(0)?.noReturnStation).toBe(true)
    expect(v.warnReturn).toBe(true)
    // ohne Station bleibt das MOTIS-Ende das Ziel — mehr wissen wir nicht
    expect(legTarget(v, 0)).toEqual({ name: 'Ziel', ...END })
  })

  it('zählt den Umweg gegen das Radzeit-Limit des Nutzers', () => {
    // 300 m Umweg ≈ 72 s: 19:30 Min Fahrt sprengt damit das 20-Minuten-Limit
    const knapp = bikeLeg({
      duration: 19.5 * 60,
      rental: rental({ fromStationName: 'A', returnConstraint: 'NONE' }),
    })
    const o = { ...opts, stations: [stations[0], near], supply: [] }
    expect(buildView(route([knapp]), o)).toBeNull()
    expect(buildView(route([knapp]), { ...o, maxBikeSec: 25 * 60 })).not.toBeNull()
  })

  it('zählt den Umweg gegen die Freiminuten', () => {
    const knapp = bikeLeg({
      duration: 27.5 * 60,
      rental: rental({ fromStationName: 'A', returnConstraint: 'NONE' }),
    })
    const o = { ...opts, stations: [stations[0], near], supply: [], maxBikeSec: 45 * 60 }
    expect(buildView(route([knapp]), o)!.bikeLegs.get(0)!.tooLong).toBe(true)
  })
})

/**
 * Eigenes Rad — entsteht beim Neuberechnen unterwegs.
 *
 * Wer schon auf dem Rad sitzt und von der Route abkommt, darf nicht zu Fuß zur
 * nächsten Station geschickt werden, um ein zweites Rad zu holen. MOTIS bekommt
 * dafür `BIKE` statt `RENTAL` — solche Etappen haben keinen `rental`-Block,
 * also auch keinen Anbieter, keine Startstation und keine Ausleihe.
 */
describe('buildView — eigenes Rad (Neuberechnung unterwegs)', () => {
  const eigenesRad = (over: Partial<Leg> = {}): Leg =>
    bikeLeg({ mode: 'BIKE', rental: undefined, ...over })

  it('zählt eine BIKE-Etappe als Radetappe, ohne Ausleihe', () => {
    const v = buildView(route([eigenesRad()]), opts)!
    const b = v.bikeLegs.get(0)!
    expect(v.hasBike).toBe(true)
    expect(b.ownBike).toBe(true)
    expect(b.startStation).toBeNull() // man hat das Rad ja schon
    expect(b.electric).toBe(false)
  })

  it('verwirft sie nicht wegen des fehlenden Anbieters', () => {
    // Die MyRadl-Prüfung gilt nur für Ausleihen — ohne diesen Zweig wäre die
    // Route hier verworfen worden und die Neuberechnung liefe ins Leere.
    expect(buildView(route([eigenesRad()]), opts)).not.toBeNull()
  })

  it('hängt trotzdem eine Rückgabestation an', () => {
    const b = buildView(route([eigenesRad()]), opts)!.bikeLegs.get(0)!
    expect(b.endStation?.id).toBe('B')
  })

  it('biegt das Ende auf die nächste Station um und rechnet den Umweg mit', () => {
    const near = station('C', END.lat + 0.0027, END.lon) // rund 300 m weiter
    const v = buildView(route([eigenesRad()]), { ...opts, stations: [stations[0], near], supply: [] })!
    const b = v.bikeLegs.get(0)!
    expect(b.endStation?.id).toBe('C')
    expect(b.returnDetourM).toBeGreaterThan(250)
    expect(v.extraSec).toBeGreaterThan(0)
  })

  it('zählt den Umweg gegen das Radzeit-Limit', () => {
    const near = station('C', END.lat + 0.0027, END.lon)
    const knapp = eigenesRad({ duration: 19.5 * 60 })
    const o = { ...opts, stations: [stations[0], near], supply: [] }
    expect(buildView(route([knapp]), o)).toBeNull()
    expect(buildView(route([knapp]), { ...o, maxBikeSec: 25 * 60 })).not.toBeNull()
  })

  it('warnt, wenn keine Rückgabestation in Reichweite ist', () => {
    const weit = [station('Fern', 48.3, 11.9)]
    const v = buildView(route([eigenesRad()]), { ...opts, stations: weit, supply: [] })!
    expect(v.bikeLegs.get(0)?.noReturnStation).toBe(true)
    expect(v.warnReturn).toBe(true)
  })

  it('bleibt auch im Standard-Modus erlaubt — ein eigenes Rad ist nie ein E-Bike', () => {
    expect(buildView(route([eigenesRad()]), { ...opts, classicOnly: true })).not.toBeNull()
  })
})

/**
 * Reihenfolge beim Neuberechnen mit eigenem Rad.
 *
 * An einer echten Neuberechnung gemessen: MOTIS lieferte sieben Vorschläge,
 * fünf mit Rad — und ganz oben stand ein Fußweg zur S-Bahn, weil der zwei
 * Minuten früher ankam. Für jemanden, der auf dem Rad sitzt, heißt dieser
 * Vorschlag „lass es hier stehen", und außerhalb einer Station sind das 20 €.
 */
describe('searchRoutes — Reihenfolge mit eigenem Rad', () => {
  const mitRad = (endeMin: number): ItineraryView =>
    ({
      it: {
        duration: endeMin * 60,
        startTime: '2026-07-24T08:00:00Z',
        endTime: new Date(Date.UTC(2026, 6, 24, 8, endeMin)).toISOString(),
        transfers: 0,
        legs: [],
      },
      hasBike: true,
      warnLong: false,
      hasElectric: false,
      warnReturn: false,
      extraSec: 0,
      bikeLegs: new Map(),
    }) as ItineraryView

  const ohneRad = (endeMin: number): ItineraryView => ({ ...mitRad(endeMin), hasBike: false })

  /** Dieselbe Ordnung wie in searchRoutes — hier ohne Netz nachgestellt. */
  const sortiere = (list: ItineraryView[], ownBike: boolean) => {
    const radZuerst = (v: ItineraryView) => (ownBike && !v.hasBike ? 1 : 0)
    return [...list].sort(
      (a, b) =>
        radZuerst(a) - radZuerst(b) ||
        Number(a.warnReturn) - Number(b.warnReturn) ||
        +new Date(viewEndTime(a)) - +new Date(viewEndTime(b)),
    )
  }

  it('stellt Routen mit Rad nach vorn, auch wenn eine Fußroute früher ankommt', () => {
    const liste = [ohneRad(17), mitRad(25), mitRad(21)]
    const sortiert = sortiere(liste, true)
    expect(sortiert.map(v => v.hasBike)).toEqual([true, true, false])
    // unter den Radrouten weiterhin die frühere zuerst
    expect(sortiert[0].it.duration).toBe(21 * 60)
  })

  it('lässt ohne eigenes Rad allein die Ankunft entscheiden', () => {
    const liste = [ohneRad(17), mitRad(25), mitRad(21)]
    expect(sortiere(liste, false).map(v => v.it.duration / 60)).toEqual([17, 21, 25])
  })

  it('behält die Strafgebühr-Regel als zweites Kriterium', () => {
    const schlecht = { ...mitRad(18), warnReturn: true }
    const gut = mitRad(24)
    expect(sortiere([schlecht, gut], true)[0]).toBe(gut)
  })
})

describe('itinerarySignature', () => {
  it('unterscheidet Routen mit anderen Linien', () => {
    const a = buildView(route([{ ...bikeLeg(), mode: 'BUS', routeShortName: '63', rental: undefined }]), opts)!
    const b = buildView(route([{ ...bikeLeg(), mode: 'BUS', routeShortName: '54', rental: undefined }]), opts)!
    expect(itinerarySignature(a)).not.toBe(itinerarySignature(b))
  })

  it('erkennt identische Routen als gleich', () => {
    const a = buildView(route([bikeLeg()]), opts)!
    const b = buildView(route([bikeLeg()]), opts)!
    expect(itinerarySignature(a)).toBe(itinerarySignature(b))
  })
})
