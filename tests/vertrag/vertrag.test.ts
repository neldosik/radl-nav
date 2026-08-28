import { describe, expect, it } from 'vitest'
import { STAEDTE } from '../../src/stadt'

/**
 * Verträge der fremden Schnittstellen.
 *
 * Diese Prüfungen gehen bewusst *ins Netz* und laufen deshalb nicht in der
 * normalen Testreihe, sondern nachts (siehe `.github/workflows/vertrag.yml`).
 * Sie prüfen keine Werte, sondern Formen: heißt das Feld noch `itineraries`,
 * liefert nextbike noch `station_information`, gibt die MVG weiter `lines`
 * mit `transportType`?
 *
 * Der Nutzen liegt im Zeitpunkt: bricht ein Anbieter seinen Vertrag, fällt es
 * hier auf — und nicht erst, wenn jemand an der Haltestelle steht und die
 * Trefferliste leer bleibt. Ein roter Lauf heißt darum nicht „unser Fehler",
 * sondern „draußen hat sich etwas geändert".
 */

const MOTIS = 'https://api.transitous.org/api'
const ZEIT = 60_000

/** Marienplatz → Ostbahnhof: kurz, immer bedient, immer mit Rad erreichbar. */
const VON = { lat: 48.13743, lon: 11.57549 }
const NACH = { lat: 48.12722, lon: 11.60455 }

async function holeJson(url: string): Promise<unknown> {
  // Ohne Kennung antwortet Transitous mit 403: Node schickt von sich aus
  // keinen User-Agent, und der Schutz davor hält das für einen Roboter.
  const r = await fetch(url, {
    headers: { 'user-agent': 'radl-nav-vertragstest (github.com/neldosik/radl-nav)' },
    signal: AbortSignal.timeout(45_000),
  })
  expect(r.ok, `${url} → HTTP ${r.status}`).toBe(true)
  return r.json()
}

function alsObjekt(x: unknown): Record<string, unknown> {
  expect(x).toBeTypeOf('object')
  expect(x).not.toBeNull()
  return x as Record<string, unknown>
}

describe('Transitous (MOTIS)', () => {
  it(
    'findet Orte und liefert Koordinaten mit Namen',
    async () => {
      const treffer = (await holeJson(
        `${MOTIS}/v1/geocode?text=Marienplatz&language=de&place=48.137,11.575&placeBias=3`,
      )) as { name?: string; lat?: number; lon?: number }[]
      expect(Array.isArray(treffer)).toBe(true)
      expect(treffer.length).toBeGreaterThan(0)
      const [erster] = treffer
      expect(typeof erster.name).toBe('string')
      expect(typeof erster.lat).toBe('number')
      expect(typeof erster.lon).toBe('number')
    },
    ZEIT,
  )

  it(
    'plant Routen mit Etappen, Zeiten und Modus',
    async () => {
      const u = new URL(`${MOTIS}/v5/plan`)
      u.searchParams.set('fromPlace', `${VON.lat},${VON.lon}`)
      u.searchParams.set('toPlace', `${NACH.lat},${NACH.lon}`)
      u.searchParams.set('preTransitModes', 'WALK')
      u.searchParams.set('postTransitModes', 'WALK')
      u.searchParams.set('directModes', 'WALK')
      u.searchParams.set('numItineraries', '3')
      const d = alsObjekt(await holeJson(u.toString()))
      const routen = d.itineraries as { legs?: unknown[] }[]
      expect(Array.isArray(routen)).toBe(true)
      expect(routen.length).toBeGreaterThan(0)
      const etappe = alsObjekt((routen[0].legs ?? [])[0])
      for (const feld of ['mode', 'startTime', 'endTime', 'duration', 'from', 'to']) {
        expect(etappe, `Etappe ohne ${feld}`).toHaveProperty(feld)
      }
    },
    ZEIT,
  )

  it(
    'kennt die Verleih-Anbieter aller eingerichteten Städte',
    async () => {
      const d = alsObjekt(await holeJson(`${MOTIS}/v1/rentals`))
      const gruppen = (d.providerGroups ?? []) as { providers?: string[] }[]
      const namen = new Set(gruppen.flatMap(g => g.providers ?? []))
      // Ist die Liste leer, hat sich das Feld umbenannt — dann sagt der
      // Vergleich unten nichts mehr aus.
      expect(namen.size).toBeGreaterThan(0)
      for (const s of STAEDTE) {
        expect(namen.has(s.provider), `${s.name}: Anbieter ${s.provider} fehlt`).toBe(true)
      }
    },
    ZEIT,
  )
})

describe('GBFS der eingerichteten Städte', () => {
  for (const s of STAEDTE) {
    it(
      `${s.name}: Stationen, Bestände und Fahrzeugtypen`,
      async () => {
        const info = alsObjekt(await holeJson(`${s.gbfs}/system_information.json`))
        expect(alsObjekt(info.data).system_id).toBe(s.systemId)

        const stationen = alsObjekt(await holeJson(`${s.gbfs}/station_information.json`))
        const liste = (alsObjekt(stationen.data).stations ?? []) as Record<string, unknown>[]
        expect(liste.length).toBeGreaterThan(0)
        for (const feld of ['station_id', 'name', 'lat', 'lon']) {
          expect(liste[0], `station_information ohne ${feld}`).toHaveProperty(feld)
        }

        const stand = alsObjekt(await holeJson(`${s.gbfs}/station_status.json`))
        const staende = (alsObjekt(stand.data).stations ?? []) as Record<string, unknown>[]
        expect(staende.length).toBeGreaterThan(0)
        expect(staende[0]).toHaveProperty('num_bikes_available')

        const typen = alsObjekt(await holeJson(`${s.gbfs}/vehicle_types.json`))
        const tl = (alsObjekt(typen.data).vehicle_types ?? []) as Record<string, unknown>[]
        expect(tl.length).toBeGreaterThan(0)
        expect(tl[0]).toHaveProperty('propulsion_type')
      },
      ZEIT,
    )
  }
})

describe('Open-Meteo', () => {
  it(
    'liefert stündliche Temperatur und Niederschlag',
    async () => {
      const u = new URL('https://api.open-meteo.com/v1/forecast')
      u.searchParams.set('latitude', String(VON.lat))
      u.searchParams.set('longitude', String(VON.lon))
      u.searchParams.set('hourly', 'temperature_2m,precipitation')
      u.searchParams.set('forecast_days', '2')
      u.searchParams.set('timezone', 'auto')
      const d = alsObjekt(await holeJson(u.toString()))
      const h = alsObjekt(d.hourly)
      expect((h.time as string[]).length).toBeGreaterThan(0)
      expect((h.temperature_2m as number[]).length).toBe((h.time as string[]).length)
      expect((h.precipitation as number[]).length).toBe((h.time as string[]).length)
    },
    ZEIT,
  )

  it(
    'liefert Höhen für mehrere Punkte auf einmal',
    async () => {
      const u = new URL('https://api.open-meteo.com/v1/elevation')
      u.searchParams.set('latitude', `${VON.lat},${NACH.lat}`)
      u.searchParams.set('longitude', `${VON.lon},${NACH.lon}`)
      const d = alsObjekt(await holeJson(u.toString()))
      expect((d.elevation as number[]).length).toBe(2)
    },
    ZEIT,
  )
})

describe('MVG', () => {
  it(
    'liefert Meldungen mit Linien und Gültigkeit',
    async () => {
      const meldungen = (await holeJson('https://www.mvg.de/api/bgw-pt/v3/messages')) as Record<
        string,
        unknown
      >[]
      expect(Array.isArray(meldungen)).toBe(true)
      // Störungsfreie Nächte gibt es; dann ist die leere Liste die richtige
      // Antwort und über die Form sagt sich nichts.
      if (!meldungen.length) return
      const m = meldungen[0]
      for (const feld of ['title', 'type', 'validFrom']) {
        expect(m, `Meldung ohne ${feld}`).toHaveProperty(feld)
      }
      const mitLinien = meldungen.find(x => ((x.lines ?? []) as unknown[]).length > 0)
      if (mitLinien) {
        const linie = alsObjekt(((mitLinien.lines ?? []) as unknown[])[0])
        expect(linie).toHaveProperty('label')
        expect(linie).toHaveProperty('transportType')
      }
    },
    ZEIT,
  )
})

describe('OpenFreeMap', () => {
  for (const stil of ['liberty', 'dark']) {
    it(
      `Stil ${stil} nennt Quellen und Ebenen`,
      async () => {
        const d = alsObjekt(await holeJson(`https://tiles.openfreemap.org/styles/${stil}`))
        expect(d.version).toBe(8)
        expect(Object.keys(alsObjekt(d.sources)).length).toBeGreaterThan(0)
        expect((d.layers as unknown[]).length).toBeGreaterThan(0)
      },
      ZEIT,
    )
  }
})
