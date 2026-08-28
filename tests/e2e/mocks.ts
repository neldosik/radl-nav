import type { Page, Route } from '@playwright/test'

/**
 * Feste Antworten für alle fremden Dienste.
 *
 * Die App hängt an vier Häusern: Transitous (Routen und Ortssuche), nextbike
 * (Radbestand), Open-Meteo (Wetter und Höhen) und OpenFreeMap (Kacheln). Gegen
 * die echten Dienste wäre die Rauchprobe keine Prüfung der App, sondern eine
 * Prüfung des Netzes: eine Wartung dort färbt den Lauf rot, und Fahrpläne wie
 * Radzahlen ändern sich stündlich — nichts davon ließe sich zusichern.
 *
 * Die Zeiten werden beim Abfangen erzeugt, nicht als Zeichenkette abgelegt:
 * eine Route, die gestern früh abfuhr, gilt der App zu Recht als vergangen.
 */

export const START = { lat: 48.13743, lon: 11.57549, name: 'Marienplatz' }
export const ZIEL = { lat: 48.12722, lon: 11.60455, name: 'Ostbahnhof' }

const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

function planAntwort() {
  const ab = Date.now() + 5 * 60_000
  const t = (min: number) => new Date(ab + min * 60_000).toISOString()

  const rad = {
    mode: 'RENTAL',
    from: { name: 'Marienplatz', lat: START.lat, lon: START.lon },
    to: { name: 'Isartor', lat: 48.1341, lon: 11.5866 },
    duration: 8 * 60,
    startTime: t(0),
    endTime: t(8),
    distance: 1600,
    rental: {
      systemId: 'nextbike_ml',
      systemName: 'MyRadl',
      fromStationName: 'Marienplatz',
      toStationName: 'Isartor',
      propulsionType: 'HUMAN',
      formFactor: 'BICYCLE',
      returnConstraint: 'ROUNDTRIP_STATION',
    },
  }

  const bahn = {
    mode: 'SUBURBAN',
    from: { name: 'Isartor', lat: 48.1341, lon: 11.5866, departure: t(11) },
    to: { name: 'Ostbahnhof', lat: ZIEL.lat, lon: ZIEL.lon, arrival: t(16) },
    duration: 5 * 60,
    startTime: t(11),
    endTime: t(16),
    scheduledStartTime: t(11),
    realTime: true,
    routeShortName: 'S1',
    headsign: 'Ostbahnhof',
    tripId: 'trip-e2e-1',
  }

  const fuss = {
    mode: 'WALK',
    from: { name: 'Ostbahnhof', lat: ZIEL.lat, lon: ZIEL.lon },
    to: { name: 'Ostbahnhof', lat: ZIEL.lat, lon: ZIEL.lon },
    duration: 2 * 60,
    startTime: t(16),
    endTime: t(18),
    distance: 150,
  }

  const legs = [rad, bahn, fuss]
  return {
    itineraries: [
      {
        duration: 18 * 60,
        startTime: t(0),
        endTime: t(18),
        transfers: 0,
        legs,
      },
    ],
    direct: [],
  }
}

const STATIONEN = [
  { station_id: 'st-marienplatz', name: 'Marienplatz', lat: START.lat, lon: START.lon },
  { station_id: 'st-isartor', name: 'Isartor', lat: 48.1341, lon: 11.5866 },
  { station_id: 'st-ostbahnhof', name: 'Ostbahnhof', lat: ZIEL.lat, lon: ZIEL.lon },
]

const BESTAND = [
  {
    station_id: 'st-marienplatz',
    num_bikes_available: 7,
    num_docks_available: 4,
    vehicle_types_available: [{ vehicle_type_id: 'bike', count: 7 }],
  },
  {
    station_id: 'st-isartor',
    num_bikes_available: 5,
    num_docks_available: 6,
    vehicle_types_available: [{ vehicle_type_id: 'bike', count: 5 }],
  },
  {
    station_id: 'st-ostbahnhof',
    num_bikes_available: 3,
    num_docks_available: 9,
    vehicle_types_available: [{ vehicle_type_id: 'bike', count: 3 }],
  },
]

const GBFS_FEEDS: Record<string, unknown> = {
  station_information: { data: { stations: STATIONEN } },
  station_status: { data: { stations: BESTAND } },
  vehicle_types: {
    data: {
      vehicle_types: [
        { vehicle_type_id: 'bike', form_factor: 'bicycle', propulsion_type: 'human' },
        { vehicle_type_id: 'ebike', form_factor: 'bicycle', propulsion_type: 'electric_assist' },
      ],
    },
  },
  free_bike_status: {
    data: {
      bikes: [{ bike_id: 'frei-1', lat: 48.1352, lon: 11.5801, vehicle_type_id: 'bike' }],
    },
  },
  system_information: { data: { system_id: 'nextbike_ml', name: 'MyRadl' } },
}

const GEOCODE = [
  { type: 'STOP', name: 'Marienplatz', id: 'st-1', lat: START.lat, lon: START.lon, areas: [{ name: 'München' }] },
  { type: 'STOP', name: 'Ostbahnhof', id: 'st-2', lat: ZIEL.lat, lon: ZIEL.lon, areas: [{ name: 'München' }] },
]

/** Fängt alles Fremde ab. Danach ist der Lauf vom Netz unabhängig. */
export async function mockApis(page: Page): Promise<void> {
  await page.route('**/api.transitous.org/**', route => {
    const pfad = new URL(route.request().url()).pathname
    if (pfad.endsWith('/geocode')) {
      const text = (new URL(route.request().url()).searchParams.get('text') ?? '').toLowerCase()
      return json(
        route,
        GEOCODE.filter(g => g.name.toLowerCase().includes(text)),
      )
    }
    if (pfad.endsWith('/reverse-geocode')) return json(route, [GEOCODE[0]])
    if (pfad.endsWith('/plan')) return json(route, planAntwort())
    if (pfad.endsWith('/trip')) return json(route, { legs: [] })
    return json(route, {})
  })

  await page.route('**/gbfs.nextbike.net/**', route => {
    const name = new URL(route.request().url()).pathname.split('/').pop()?.replace('.json', '') ?? ''
    return json(route, GBFS_FEEDS[name] ?? { data: {} })
  })

  await page.route('**/api.open-meteo.com/**', route => {
    const u = new URL(route.request().url())
    if (u.pathname.includes('elevation')) return json(route, { elevation: [520, 522, 519] })
    return json(route, {
      hourly: {
        time: [new Date().toISOString().slice(0, 13) + ':00'],
        temperature_2m: [18],
        precipitation: [0],
        precipitation_probability: [5],
        weathercode: [1],
        wind_speed_10m: [9],
        wind_gusts_10m: [14],
        wind_direction_10m: [250],
      },
    })
  })

  await page.route('**/www.mvg.de/api/**', route =>
    json(route, [
      {
        title: 'S1: Verspätungen',
        description: '<p>Wegen einer Signalstörung kommt es zu <b>Verspätungen</b>.</p>',
        type: 'INCIDENT',
        validFrom: Date.now() - 3600_000,
        validTo: Date.now() + 3600_000,
        lines: [{ label: 'S1', transportType: 'SBAHN' }],
        links: [{ text: 'Mehr', url: 'https://www.mvg.de/meldung' }],
      },
    ]),
  )

  // Kacheln und Kartenstil: in Chrome ohne GPU rendert MapLibre ohnehin nichts
  // Prüfbares — die leere Antwort hält den Lauf offline und schnell.
  await page.route('**/tiles.openfreemap.org/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
}

/** Zustand, den ein Test voraussetzt, vor dem ersten Skript der Seite setzen. */
export async function seedStorage(page: Page, eintraege: Record<string, string>): Promise<void> {
  await page.addInitScript(werte => {
    for (const [k, v] of Object.entries(werte)) localStorage.setItem(k, v)
  }, eintraege)
}

/** Fahrt fürs Fahrtenbuch — mit Weg, damit auch GPX prüfbar ist. */
export function fahrt(id: string, vorTagen: number) {
  return {
    id,
    at: new Date(Date.now() - vorTagen * 86_400_000).toISOString(),
    from: 'Marienplatz',
    to: 'Ostbahnhof',
    seconds: 1080,
    legs: 3,
    bikeMinutes: 8,
    track: [
      { lat: 48.1374, lon: 11.5755 },
      { lat: 48.1352, lon: 11.5801 },
      { lat: 48.1341, lon: 11.5866 },
    ],
  }
}

/** Suche als Verweis — spart das Tippen in der Ortssuche. */
export const SUCH_URL = `/?von=${START.lat},${START.lon},${START.name}&nach=${ZIEL.lat},${ZIEL.lon},${ZIEL.name}`
