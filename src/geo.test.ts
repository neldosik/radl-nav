import { describe, expect, it } from 'vitest'
import { bearing, bearingDelta, clusterFreeBikes, distanceToPath, haversine, nachziehAnteil, nachziehen, nearbyStations, nearestStation, planPickup, projectOnPath, remainingShare, smoothBearing } from './geo'
import type { FreeBike, LatLon, Station } from './types'

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

describe('remainingShare', () => {
  // Gerade Linie nach Norden, rund 1,1 km je 0,01°
  const path: LatLon[] = [
    { lat: 48.10, lon: 11.5 },
    { lat: 48.11, lon: 11.5 },
    { lat: 48.12, lon: 11.5 },
    { lat: 48.13, lon: 11.5 },
  ]

  it('gibt am Anfang die ganze Etappe zurück', () => {
    expect(remainingShare(path, { lat: 48.10, lon: 11.5 })).toBeCloseTo(1, 2)
  })

  it('gibt am Ziel nichts mehr zurück', () => {
    expect(remainingShare(path, { lat: 48.13, lon: 11.5 })).toBeCloseTo(0, 2)
  })

  it('gibt in der Mitte etwa die Hälfte zurück', () => {
    const share = remainingShare(path, { lat: 48.115, lon: 11.5 })!
    expect(share).toBeGreaterThan(0.3)
    expect(share).toBeLessThan(0.7)
  })

  it('nimmt den nächstgelegenen Punkt, auch wenn man neben der Linie steht', () => {
    // deutlich östlich versetzt, aber auf Höhe des dritten Stützpunkts
    const share = remainingShare(path, { lat: 48.12, lon: 11.53 })!
    expect(share).toBeCloseTo(1 / 3, 1)
  })

  it('bleibt zwischen 0 und 1, auch weit hinter dem Ziel', () => {
    const share = remainingShare(path, { lat: 48.20, lon: 11.5 })!
    expect(share).toBeGreaterThanOrEqual(0)
    expect(share).toBeLessThanOrEqual(1)
  })

  it('liefert null für eine unbrauchbare Linie', () => {
    expect(remainingShare([], { lat: 48.1, lon: 11.5 })).toBeNull()
    expect(remainingShare([{ lat: 48.1, lon: 11.5 }], { lat: 48.1, lon: 11.5 })).toBeNull()
  })
})

describe('distanceToPath', () => {
  const path: LatLon[] = [
    { lat: 48.10, lon: 11.5 },
    { lat: 48.13, lon: 11.5 },
  ]

  it('ist auf der Linie nahe null', () => {
    expect(distanceToPath(path, { lat: 48.115, lon: 11.5 })!).toBeLessThan(5)
  })

  it('misst den seitlichen Abstand, nicht den zum nächsten Stützpunkt', () => {
    // 0,001° Länge ≈ 74 m auf dieser Breite, mitten zwischen den Stützpunkten
    const d = distanceToPath(path, { lat: 48.115, lon: 11.501 })!
    expect(d).toBeGreaterThan(50)
    expect(d).toBeLessThan(100)
  })

  it('erkennt eine deutliche Abweichung', () => {
    expect(distanceToPath(path, { lat: 48.115, lon: 11.51 })!).toBeGreaterThan(500)
  })

  it('liefert null für eine unbrauchbare Linie', () => {
    expect(distanceToPath([], { lat: 48.1, lon: 11.5 })).toBeNull()
  })
})

describe('projectOnPath · Kartenabgleich', () => {
  const path: LatLon[] = [
    { lat: 48.10, lon: 11.5 },
    { lat: 48.13, lon: 11.5 },
  ]

  it('zieht einen danebenliegenden Standort auf die Linie', () => {
    const pr = projectOnPath(path, { lat: 48.115, lon: 11.501 })!
    // gleiche Breite, aber wieder auf dem Meridian der Linie
    expect(pr.point.lon).toBeCloseTo(11.5, 4)
    expect(pr.point.lat).toBeCloseTo(48.115, 3)
  })

  it('nennt den zurückgelegten Weg und die Gesamtlänge', () => {
    const pr = projectOnPath(path, { lat: 48.115, lon: 11.5 })!
    expect(pr.total).toBeGreaterThan(3000)
    expect(pr.along).toBeCloseTo(pr.total / 2, -2)
    expect(pr.along + pr.share * pr.total).toBeCloseTo(pr.total, 3)
  })

  it('hält den gezogenen Punkt am Anfang bzw. Ende fest', () => {
    const vorne = projectOnPath(path, { lat: 48.05, lon: 11.5 })!
    expect(vorne.point.lat).toBeCloseTo(48.10, 4)
    const hinten = projectOnPath(path, { lat: 48.20, lon: 11.5 })!
    expect(hinten.point.lat).toBeCloseTo(48.13, 4)
  })
})

describe('bearing — Kurs für die drehende Karte', () => {
  const M = { lat: 48.137, lon: 11.575 }

  it('zeigt nach Norden, Osten, Süden, Westen', () => {
    expect(bearing(M, { lat: M.lat + 0.01, lon: M.lon })).toBeCloseTo(0, 0)
    expect(bearing(M, { lat: M.lat, lon: M.lon + 0.01 })).toBeCloseTo(90, 0)
    expect(bearing(M, { lat: M.lat - 0.01, lon: M.lon })).toBeCloseTo(180, 0)
    expect(bearing(M, { lat: M.lat, lon: M.lon - 0.01 })).toBeCloseTo(270, 0)
  })

  it('bleibt im Bereich 0…360', () => {
    const b = bearing({ lat: 48.2, lon: 11.6 }, { lat: 48.1, lon: 11.5 })
    expect(b).toBeGreaterThanOrEqual(0)
    expect(b).toBeLessThan(360)
  })
})

describe('bearingDelta — kürzester Weg zwischen zwei Kursen', () => {
  it('nimmt die kurze Seite über die Naht bei 0°', () => {
    // Von 350° nach 10° sind es 20° nach rechts, nicht 340° nach links
    expect(bearingDelta(350, 10)).toBe(20)
    expect(bearingDelta(10, 350)).toBe(-20)
  })

  it('rechnet innerhalb des Bereichs normal', () => {
    expect(bearingDelta(90, 120)).toBe(30)
    expect(bearingDelta(120, 90)).toBe(-30)
  })
})

describe('smoothBearing — Karte darf nicht zappeln', () => {
  it('übernimmt den ersten Kurs unverändert', () => {
    expect(smoothBearing(null, 42)).toBe(42)
  })

  it('geht nur einen Teil des Weges', () => {
    // Von 0° zu 100° mit Anteil 0.25 => 25°
    expect(smoothBearing(0, 100, 0.25)).toBeCloseTo(25, 5)
  })

  it('dreht über die Naht nicht einmal im Kreis', () => {
    // Von 350° zu 10°: kurzer Weg nach rechts, Ergebnis knapp hinter 350°
    const r = smoothBearing(350, 10, 0.5)
    expect(r).toBeCloseTo(0, 5)
  })

  it('bleibt im Bereich 0…360', () => {
    const r = smoothBearing(5, 300, 0.5)
    expect(r).toBeGreaterThanOrEqual(0)
    expect(r).toBeLessThan(360)
  })
})

describe('nachziehAnteil / nachziehen — gleitende Standortanzeige', () => {
  it('ist unabhängig von der Bildrate', () => {
    const ziel = { lat: 48.14, lon: 11.58 }
    // Zwei kurze Bilder gegen ein langes: derselbe Weg muss herauskommen,
    // sonst liefe die Nachführung auf schnellen Geräten sichtbar flotter.
    let a = { lat: 48.13, lon: 11.57 }
    a = nachziehen(a, ziel, nachziehAnteil(8, 400))
    a = nachziehen(a, ziel, nachziehAnteil(8, 400))
    const b = nachziehen({ lat: 48.13, lon: 11.57 }, ziel, nachziehAnteil(16, 400))
    expect(haversine(a, b)).toBeLessThan(0.5)
  })

  it('läuft nie über das Ziel hinaus und ist vor der nächsten Messung da', () => {
    // Ein Schritt, wie ihn eine Sekunde Radfahren macht — rund fünf Meter.
    const ziel = { lat: 48.14, lon: 11.58 }
    let p = { lat: 48.13996, lon: 11.58 }
    const start = haversine(p, ziel)
    expect(start).toBeGreaterThan(3)
    let vorher = start
    // Ein Sekundentakt bei 60 Bildern je Sekunde.
    for (let i = 0; i < 60; i++) {
      p = nachziehen(p, ziel, nachziehAnteil(16, 400))
      const jetzt = haversine(p, ziel)
      expect(jetzt).toBeLessThanOrEqual(vorher + 1e-9)
      vorher = jetzt
    }
    // Bis die nächste Messung eintrifft, ist der Rückstand praktisch weg —
    // sonst schleppte die Anzeige einen wachsenden Verzug mit sich.
    expect(vorher).toBeLessThan(start * 0.12)
  })

  it('baut in einer Zeitkonstanten rund zwei Drittel ab', () => {
    expect(nachziehAnteil(400, 400)).toBeCloseTo(0.632, 2)
  })

  it('holt bei unsinnigen Werten sofort auf, statt stehen zu bleiben', () => {
    expect(nachziehAnteil(0, 400)).toBe(1)
    expect(nachziehAnteil(16, 0)).toBe(1)
  })
})
