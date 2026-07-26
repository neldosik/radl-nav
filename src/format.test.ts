import { describe, expect, it } from 'vitest'
import {
  bikeWord,
  gmapsFullBikeLink,
  gmapsLink,
  legDelayMin,
  legKind,
  legLabel,
  lineShort,
  mins,
  nextbikeLink,
  pickRentalUri,
} from './format'
import { decodePolyline } from './polyline'
import type { Itinerary, Leg } from './types'

const leg = (over: Partial<Leg> = {}): Leg => ({
  mode: 'WALK',
  from: { name: 'A', lat: 48.1, lon: 11.5 },
  to: { name: 'B', lat: 48.2, lon: 11.6 },
  duration: 600,
  startTime: '2026-07-24T08:00:00Z',
  endTime: '2026-07-24T08:10:00Z',
  ...over,
})

describe('mins', () => {
  it('rundet Sekunden auf Minuten', () => {
    expect(mins(600)).toBe(10)
    expect(mins(90)).toBe(2)
  })

  it('zeigt nie 0 Minuten an', () => {
    expect(mins(5)).toBe(1)
  })
})

describe('bikeWord', () => {
  it('nutzt Singular nur bei genau einem Rad', () => {
    expect(bikeWord(1)).toBe('Rad')
    expect(bikeWord(0)).toBe('Räder')
    expect(bikeWord(3)).toBe('Räder')
  })
})

describe('legKind / legLabel / lineShort', () => {
  it('ordnet Verkehrsmittel zu', () => {
    expect(legKind(leg({ mode: 'WALK' }))).toBe('walk')
    expect(legKind(leg({ mode: 'RENTAL' }))).toBe('bike')
    expect(legKind(leg({ mode: 'SUBWAY' }))).toBe('line')
  })

  it('benennt Etappen auf Deutsch', () => {
    expect(legLabel(leg({ mode: 'WALK' }))).toBe('zu Fuß')
    expect(legLabel(leg({ mode: 'SUBWAY' }))).toBe('U-Bahn')
    expect(legLabel(leg({ mode: 'RENTAL', rental: { systemName: 'MyRadl ' } }))).toBe('MyRadl')
  })

  it('nimmt für das Badge die Liniennummer', () => {
    expect(lineShort(leg({ mode: 'BUS', routeShortName: '63' }))).toBe('63')
  })
})

describe('legDelayMin', () => {
  it('rechnet Verspätung aus Soll und Ist', () => {
    const l = leg({
      mode: 'BUS',
      realTime: true,
      scheduledStartTime: '2026-07-24T08:00:00Z',
      startTime: '2026-07-24T08:03:00Z',
    })
    expect(legDelayMin(l)).toBe(3)
  })

  it('erkennt verfrühte Abfahrt als negativ', () => {
    const l = leg({
      mode: 'BUS',
      realTime: true,
      scheduledStartTime: '2026-07-24T08:05:00Z',
      startTime: '2026-07-24T08:03:00Z',
    })
    expect(legDelayMin(l)).toBe(-2)
  })

  it('gibt null ohne Echtzeitdaten zurück', () => {
    expect(legDelayMin(leg({ mode: 'BUS' }))).toBeNull()
  })
})

describe('gmapsLink', () => {
  it('wählt den Reisemodus passend zur Etappe', () => {
    expect(gmapsLink(leg({ mode: 'WALK' }))).toContain('travelmode=walking')
    expect(gmapsLink(leg({ mode: 'RENTAL' }))).toContain('travelmode=bicycling')
    expect(gmapsLink(leg({ mode: 'BUS' }))).toContain('travelmode=transit')
  })

  it('startet die Navigation nur auf Wunsch', () => {
    expect(gmapsLink(leg(), true)).toContain('dir_action=navigate')
    expect(gmapsLink(leg())).not.toContain('dir_action')
  })
})

describe('gmapsFullBikeLink', () => {
  const it_ = (legs: Leg[]): Itinerary => ({
    duration: 100,
    startTime: '2026-07-24T08:00:00Z',
    endTime: '2026-07-24T08:40:00Z',
    transfers: 0,
    legs,
  })

  it('baut eine Sammel-Route für reine Radwege', () => {
    const url = gmapsFullBikeLink(it_([leg({ mode: 'WALK' }), leg({ mode: 'RENTAL' })]))
    expect(url).toContain('travelmode=bicycling')
    expect(url).toContain('waypoints=')
  })

  it('gibt null zurück, sobald ÖPNV dabei ist (Google kann das nicht)', () => {
    expect(gmapsFullBikeLink(it_([leg({ mode: 'WALK' }), leg({ mode: 'BUS' })]))).toBeNull()
  })
})

describe('decodePolyline', () => {
  it('dekodiert Google-Polyline mit Precision 5', () => {
    // bekanntes Beispiel aus der Google-Dokumentation
    const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5)
    expect(pts).toHaveLength(3)
    expect(pts[0][1]).toBeCloseTo(38.5, 4) // lat
    expect(pts[0][0]).toBeCloseTo(-120.2, 4) // lon
    expect(pts[2][1]).toBeCloseTo(43.252, 3)
  })

  it('liefert [] für leeren String', () => {
    expect(decodePolyline('')).toEqual([])
  })
})

describe('nextbikeLink', () => {
  const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
  const ANDROID = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36'
  const rental = {
    rentalUriWeb: 'https://web.example/station/7',
    rentalUriAndroid: 'https://android.example/station/7',
    rentalUriIOS: 'https://ios.example/station/7',
  }

  it('nimmt auf dem iPhone den iOS-Link, nicht den Android-Link', () => {
    expect(nextbikeLink(leg({ rental }), IOS)).toBe(rental.rentalUriIOS)
  })

  it('nimmt auf Android den Android-Link', () => {
    expect(nextbikeLink(leg({ rental }), ANDROID)).toBe(rental.rentalUriAndroid)
  })

  it('nimmt am Rechner den Web-Link', () => {
    expect(nextbikeLink(leg({ rental }), 'Mozilla/5.0 (Windows NT 10.0)')).toBe(rental.rentalUriWeb)
  })

  it('weicht ohne Plattform-Link auf den Web-Link aus', () => {
    expect(nextbikeLink(leg({ rental: { rentalUriWeb: rental.rentalUriWeb } }), IOS)).toBe(rental.rentalUriWeb)
  })

  it('landet ohne jeden Link auf der Nextbike-App statt auf einer 404', () => {
    expect(nextbikeLink(leg(), ANDROID)).toBe('https://app.nextbike.net/')
  })
})

describe('pickRentalUri', () => {
  const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'
  const ANDROID = 'Mozilla/5.0 (Linux; Android 15)'
  const uris = {
    android: 'https://app.nextbike.net/station?id=7',
    ios: 'https://app.nextbike.net/station?id=7',
    web: 'https://nxtb.it/p/7',
  }

  it('nimmt auf Android den App-Link der Station', () => {
    expect(pickRentalUri(uris, ANDROID)).toBe(uris.android)
  })

  it('nimmt auf dem iPhone den iOS-Link', () => {
    expect(pickRentalUri(uris, IOS)).toBe(uris.ios)
  })

  it('nimmt am Rechner den Web-Link', () => {
    expect(pickRentalUri(uris, 'Mozilla/5.0 (Windows NT 10.0)')).toBe(uris.web)
  })

  it('weicht ohne Links auf die Nextbike-App aus', () => {
    expect(pickRentalUri(undefined, ANDROID)).toBe('https://app.nextbike.net/')
  })
})
