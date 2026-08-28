/**
 * Sicherung des Fahrtenbuchs.
 *
 * Das Fahrtenbuch liegt im `localStorage` — gelöschte Browserdaten, eine neu
 * aufgesetzte Hülle oder ein neues Telefon nehmen es ersatzlos mit. Es gibt
 * kein Backend, also braucht es einen Weg über eine Datei: hinaus als JSON
 * (vollständig, wieder einlesbar) und je Fahrt als GPX (der aufgezeichnete
 * Weg, lesbar für Komoot, Strava und Konsorten).
 */
import { loadTrips, mergeTrips } from './history'
import type { TripRecord } from './history'

export const SICHERUNG_VERSION = 1

export interface Sicherung {
  app: 'radl-navi'
  version: number
  erstellt: string
  trips: TripRecord[]
}

export type LeseErgebnis =
  | { ok: true; trips: TripRecord[] }
  | { ok: false; grund: 'format' | 'leer' }

function istFahrt(x: unknown): x is TripRecord {
  if (typeof x !== 'object' || x === null) return false
  const t = x as Record<string, unknown>
  return (
    typeof t.id === 'string' &&
    typeof t.at === 'string' &&
    !Number.isNaN(Date.parse(t.at)) &&
    typeof t.from === 'string' &&
    typeof t.to === 'string' &&
    typeof t.seconds === 'number' &&
    typeof t.legs === 'number' &&
    typeof t.bikeMinutes === 'number'
  )
}

export function sicherungErzeugen(trips: TripRecord[] = loadTrips()): string {
  const s: Sicherung = {
    app: 'radl-navi',
    version: SICHERUNG_VERSION,
    erstellt: new Date().toISOString(),
    trips,
  }
  return JSON.stringify(s, null, 2)
}

/**
 * Eine fremde Datei ist erst einmal nichts als Text. Einzelne unbrauchbare
 * Einträge werden übergangen statt die ganze Sicherung abzulehnen — sonst
 * kostet ein einziges kaputtes Feld das ganze Fahrtenbuch.
 */
export function sicherungLesen(text: string): LeseErgebnis {
  let roh: unknown
  try {
    roh = JSON.parse(text)
  } catch {
    return { ok: false, grund: 'format' }
  }
  // Auch eine nackte Liste von Fahrten annehmen: so sieht der Inhalt aus,
  // wenn jemand `radl.trips` von Hand aus dem Speicher kopiert.
  const liste = Array.isArray(roh)
    ? roh
    : typeof roh === 'object' && roh !== null && Array.isArray((roh as Sicherung).trips)
      ? (roh as Sicherung).trips
      : null
  if (!liste) return { ok: false, grund: 'format' }
  const trips = liste.filter(istFahrt)
  if (!trips.length) return { ok: false, grund: 'leer' }
  return { ok: true, trips }
}

export function sicherungEinlesen(text: string): LeseErgebnis & { added?: number } {
  const gelesen = sicherungLesen(text)
  if (!gelesen.ok) return gelesen
  const { added } = mergeTrips(gelesen.trips)
  return { ...gelesen, added }
}

/** XML-Sonderzeichen im Namen — „Fürst & Söhne" zerlegte sonst die Datei. */
function xml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Aufgezeichneter Weg einer Fahrt als GPX. Ohne Spur gibt es nichts zu
 *  schreiben — dann `null`, damit die Ansicht den Knopf weglässt. */
export function gpxErzeugen(trip: TripRecord): string | null {
  if (!trip.track || trip.track.length < 2) return null
  const name = `${trip.from} → ${trip.to}`
  const punkte = trip.track
    .map(p => `        <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}" />`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Radl Navi" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${xml(name)}</name>
    <time>${trip.at}</time>
  </metadata>
  <trk>
    <name>${xml(name)}</name>
    <trkseg>
${punkte}
    </trkseg>
  </trk>
</gpx>
`
}

/** Dateiname ohne Überraschungen: keine Schrägstriche, keine Umlaute im Pfad. */
export function dateiName(praefix: string, endung: string, jetzt = new Date()): string {
  const tag = jetzt.toISOString().slice(0, 10)
  return `${praefix}-${tag}.${endung}`
}

/** Datei anbieten. Der Objekt-URL wird wieder freigegeben — sonst hält der
 *  Browser den Inhalt bis zum Neuladen im Speicher. */
export function dateiSpeichern(name: string, inhalt: string, typ: string): void {
  const url = URL.createObjectURL(new Blob([inhalt], { type: typ }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
