/**
 * Die Suche in der Adresszeile — und damit teilbar.
 *
 * Vorher lebte der Stand der Suche ausschließlich im React-Zustand: ein
 * Neuladen warf ihn weg, ein Link auf „Marienplatz → Ostbahnhof" war nicht
 * möglich, und die Zurück-Taste konnte nicht zur Trefferliste zurückführen.
 * Hier steht die Übersetzung in beide Richtungen, ohne React — deshalb
 * prüfbar ohne Ansicht.
 */
import type { Place } from './types'
import { MAX_BIKES_PER_ACCOUNT } from './components/FilterModal'

export type ZeitModus = 'now' | 'depart' | 'arrive'
export type RadTyp = 'classic' | 'any'

export interface SuchStand {
  from: Place | null
  to: Place | null
  timeMode: ZeitModus
  /** Wert eines `datetime-local`-Feldes: `YYYY-MM-DDTHH:MM`, Ortszeit. */
  timeVal: string
  maxBike: number
  bikeType: RadTyp
  bikes: number
}

/** Zeitlimit der Radetappe, das die App voreingestellt hat. Steht es in der
 *  Adresszeile, hat es jemand bewusst geändert. */
export const MAX_BIKE_STD = 30
export const MAX_BIKE_WERTE = [10, 15, 20, 30, 9999]

const ZEIT_MUSTER = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/** `lat,lon,Name` — die Zahlen zuerst, damit der Name Kommas enthalten darf. */
function ortSchreiben(p: Place): string {
  // Fünf Nachkommastellen sind gut ein Meter; genauer ist eine Adresse nicht.
  return `${p.lat.toFixed(5)},${p.lon.toFixed(5)},${p.name}`
}

function ortLesen(roh: string | null): Place | null {
  if (!roh) return null
  const teile = roh.split(',')
  if (teile.length < 2) return null
  const lat = Number(teile[0])
  const lon = Number(teile[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  const name = teile.slice(2).join(',').trim()
  return { lat, lon, name: name || `${lat.toFixed(4)}, ${lon.toFixed(4)}` }
}

/** Nur das, was vom Standard abweicht — ein geteilter Link bleibt so lesbar. */
export function suchParams(s: SuchStand): URLSearchParams {
  const p = new URLSearchParams()
  if (s.from) p.set('von', ortSchreiben(s.from))
  if (s.to) p.set('nach', ortSchreiben(s.to))
  if (s.timeMode !== 'now' && ZEIT_MUSTER.test(s.timeVal)) {
    p.set('modus', s.timeMode)
    p.set('zeit', s.timeVal)
  }
  if (s.bikeType === 'any') p.set('rad', 'any')
  if (s.maxBike !== MAX_BIKE_STD) p.set('max', String(s.maxBike))
  if (s.bikes > 1) p.set('n', String(s.bikes))
  return p
}

/**
 * Umgekehrter Weg. Fehlende oder unsinnige Werte werden weggelassen, nicht
 * geraten: ein zusammengekürzter Link soll die App nicht in einen Zustand
 * bringen, den niemand gewollt hat.
 */
export function standAusParams(p: URLSearchParams): Partial<SuchStand> {
  const stand: Partial<SuchStand> = {}

  const von = ortLesen(p.get('von'))
  const nach = ortLesen(p.get('nach'))
  if (von) stand.from = von
  if (nach) stand.to = nach

  const modus = p.get('modus')
  const zeit = p.get('zeit')
  if ((modus === 'depart' || modus === 'arrive') && zeit && ZEIT_MUSTER.test(zeit)) {
    stand.timeMode = modus
    stand.timeVal = zeit
  }

  if (p.get('rad') === 'any') stand.bikeType = 'any'

  const max = Number(p.get('max'))
  if (MAX_BIKE_WERTE.includes(max)) stand.maxBike = max

  const n = Number(p.get('n'))
  if (Number.isInteger(n) && n >= 1 && n <= MAX_BIKES_PER_ACCOUNT) stand.bikes = n

  return stand
}

/** Adresse der aktuellen Suche. `basis` ist die Seite ohne Abfrageteil. */
export function suchUrl(s: SuchStand, basis: string): string {
  const u = new URL(basis)
  const q = suchParams(s).toString()
  u.search = q
  u.hash = ''
  return u.toString()
}

export type TeilenErgebnis = 'geteilt' | 'kopiert' | 'fehler'

/**
 * Teilen über das System, sonst in die Zwischenablage. Der Abbruch des
 * Systemdialogs ist kein Fehler — er kommt als `AbortError` und würde sonst
 * als „hat nicht geklappt" gemeldet.
 */
export async function teilen(url: string, titel: string): Promise<TeilenErgebnis> {
  if (navigator.share) {
    try {
      await navigator.share({ title: titel, url })
      return 'geteilt'
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'geteilt'
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'kopiert'
  } catch {
    return 'fehler'
  }
}
