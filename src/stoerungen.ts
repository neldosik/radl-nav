import { stadt } from './stadt'
import type { Leg } from './types'

/**
 * Störungsmeldungen des MVV/MVG.
 *
 * Transitous liefert zwar Verspätungen und Ausfälle einzelner Fahrten, aber
 * keine Meldungen: das Feld `alerts` der Schnittstelle bleibt für München leer
 * (DELFI liefert nur TripUpdates). „S8 fährt heute nicht zum Flughafen" stand
 * deshalb nirgends in der App. Die Meldungen kommen darum direkt von der MVG.
 */
const MVG_MELDUNGEN = 'https://www.mvg.de/api/bgw-pt/v3/messages'

const ABRUF_TIMEOUT_MS = 15_000
/** Meldungen ändern sich im Minutentakt, nicht im Sekundentakt. */
const PUFFER_MS = 5 * 60_000

export type StoerungsArt = 'incident' | 'plan'

export interface Stoerungslinie {
  label: string
  /** MVG-Gattung: UBAHN | SBAHN | TRAM | BUS | REGIONAL_BUS | BAHN */
  art: string
}

export interface Stoerung {
  id: string
  titel: string
  text: string
  typ: StoerungsArt
  von: number
  /** Ohne Ende offen — die MVG lässt `validTo` bei Dauerbaustellen weg. */
  bis: number | null
  linien: Stoerungslinie[]
  link: string | null
}

interface MvgMeldung {
  title?: string
  description?: string
  type?: string
  validFrom?: number
  validTo?: number
  publication?: number
  lines?: { label?: string; transportType?: string }[]
  links?: { text?: string; url?: string }[]
}

const ENTITAETEN: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  nbsp: ' ',
}

/** Aus dem HTML-Text der MVG lesbaren Fließtext machen. */
export function alsText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#?\w+);/g, (ganz, name: string) => ENTITAETEN[name.toLowerCase()] ?? ganz)
    .replace(/\s+/g, ' ')
    .trim()
}

function alsStoerung(m: MvgMeldung, i: number): Stoerung | null {
  const titel = (m.title ?? '').trim()
  if (!titel) return null
  const von = m.validFrom ?? m.publication ?? 0
  return {
    id: `${von}-${i}-${titel}`,
    titel,
    text: alsText(m.description ?? ''),
    typ: m.type === 'INCIDENT' ? 'incident' : 'plan',
    von,
    bis: m.validTo ?? null,
    linien: (m.lines ?? [])
      .filter(l => !!l.label)
      .map(l => ({ label: (l.label as string).trim(), art: l.transportType ?? '' })),
    link: m.links?.find(l => l.url)?.url ?? null,
  }
}

let puffer: { at: number; werte: Stoerung[] } | null = null
let laufend: Promise<Stoerung[]> | null = null

/** Alle aktuellen Meldungen; bei Netzfehler eine leere Liste — die Route soll
 *  auch ohne Meldungsdienst angezeigt werden. */
export async function ladeStoerungen(signal?: AbortSignal): Promise<Stoerung[]> {
  // Außerhalb Münchens gibt es keinen offenen Meldungsdienst — Münchner
  // Meldungen wären dort schlicht falsch.
  if (stadt().meldungen !== 'mvg') return []
  if (puffer && Date.now() - puffer.at < PUFFER_MS) return puffer.werte
  if (laufend) return laufend

  laufend = (async () => {
    try {
      const grenze = AbortSignal.timeout(ABRUF_TIMEOUT_MS)
      const r = await fetch(MVG_MELDUNGEN, {
        signal: signal ? AbortSignal.any([signal, grenze]) : grenze,
      })
      if (!r.ok) return []
      const roh: unknown = await r.json()
      if (!Array.isArray(roh)) return []
      const werte = (roh as MvgMeldung[])
        .map(alsStoerung)
        .filter((s): s is Stoerung => s !== null)
      puffer = { at: Date.now(), werte }
      return werte
    } catch {
      return []
    } finally {
      laufend = null
    }
  })()
  return laufend
}

/** Nur für Tests: den Zwischenspeicher leeren. */
export function pufferLeeren(): void {
  puffer = null
  laufend = null
}

/** MVG-Gattung zu den Modi, unter denen dieselbe Linie bei MOTIS auftaucht. */
const GATTUNG_ZU_MODUS: Record<string, string[]> = {
  UBAHN: ['SUBWAY', 'METRO'],
  SBAHN: ['SUBURBAN', 'METRO', 'RAIL', 'REGIONAL_RAIL'],
  TRAM: ['TRAM'],
  BUS: ['BUS', 'COACH'],
  REGIONAL_BUS: ['BUS', 'COACH'],
  BAHN: ['RAIL', 'REGIONAL_RAIL', 'REGIONAL_FAST_RAIL', 'LONG_DISTANCE', 'HIGHSPEED_RAIL'],
}

/** „SEV S8" meint die S8, „S6/8" beide Stämme. */
function labelPasst(label: string, linie: string): boolean {
  const sauber = label.replace(/^SEV\s+/i, '').trim().toUpperCase()
  const ziel = linie.trim().toUpperCase()
  if (sauber === ziel) return true
  const teile = sauber.match(/^([A-Z]*)([\d/]+)$/)
  if (!teile) return false
  const [, praefix, ziffern] = teile
  return ziffern.split('/').some(z => `${praefix}${z}` === ziel)
}

function betrifft(s: Stoerung, leg: Leg): boolean {
  const linie = leg.routeShortName
  if (!linie) return false
  return s.linien.some(l => {
    if (!labelPasst(l.label, linie)) return false
    const modi = GATTUNG_ZU_MODUS[l.art]
    // Unbekannte Gattung: lieber melden als verschweigen.
    return !modi || modi.includes(leg.mode)
  })
}

function gilt(s: Stoerung, jetzt: number): boolean {
  return s.von <= jetzt && (s.bis == null || s.bis >= jetzt)
}

/**
 * Meldungen zu den Linien einer Verbindung, aktuell gültig und ohne Dubletten —
 * dieselbe Baustelle steht im Feed mehrfach, einmal je Richtung.
 */
export function stoerungenFuerEtappen(
  legs: Leg[],
  alle: Stoerung[],
  jetzt: number = Date.now(),
): Stoerung[] {
  const gesehen = new Set<string>()
  const treffer: Stoerung[] = []
  for (const s of alle) {
    if (!gilt(s, jetzt)) continue
    if (!legs.some(l => betrifft(s, l))) continue
    if (gesehen.has(s.titel)) continue
    gesehen.add(s.titel)
    treffer.push(s)
  }
  // Echte Störungen zuerst, Fahrplanänderungen danach.
  return treffer.sort((a, b) => (a.typ === b.typ ? 0 : a.typ === 'incident' ? -1 : 1))
}
