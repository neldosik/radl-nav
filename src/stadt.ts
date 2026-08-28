import { haversine } from './geo'
import type { LatLon } from './types'

/**
 * Stadt und Leihradsystem als Konfiguration statt als fest verdrahtete Zeichenkette.
 *
 * Bis hierher stand München an sechs Stellen im Code: die GBFS-Adresse in
 * `api.ts`, die Systemkennung in `routing.ts`, der Kartenmittelpunkt in drei
 * Komponenten, der Tarif in `stats.ts`. Eine zweite Stadt wäre nur mit einer
 * Kopie der App gegangen.
 *
 * Aufgenommen sind Städte, für die es **beides** gibt: einen GBFS-Feed von
 * nextbike und einen Verleih-Anbieter in Transitous — ohne den plant MOTIS
 * keine Radetappen (geprüft über /api/v1/rentals am 28.08.2026).
 */

export interface Tarif {
  /** Abrechnungstakt in Minuten — jede angefangene Einheit kostet. */
  taktMin: number
  klassischCent: number
  elektroCent: number
  /** Höchstbetrag je Tag. */
  tagesdeckelCent: number
  /** Freiminuten je Ausleihe mit ÖPNV-Abo. */
  freiminutenAbo: number
}

export interface Stadt {
  id: string
  name: string
  /** Name des Leihradsystems, wie ihn der Betreiber führt. */
  radName: string
  mitte: LatLon
  /** GBFS-Wurzel (ohne Schrägstrich am Ende). */
  gbfs: string
  /** systemId im GBFS-Feed — daran hängt die Zuordnung der MOTIS-Etappen. */
  systemId: string
  /** providerId in Transitous (/api/v1/rentals). */
  provider: string
  /**
   * Tarif, oder `null`, wenn er nicht belastbar bekannt ist.
   *
   * Die Preisliste im GBFS-Feed (`system_pricing_plans`) nennt zwar Beträge,
   * ordnet sie aber keinem Fahrzeugtyp zu (`default_pricing_plan_id` fehlt in
   * `vehicle_types`). Für München ist der Tarif geprüft; für die übrigen
   * Städte zeigt die App lieber gar keinen Preis als einen erfundenen.
   */
  tarif: Tarif | null
  /** Störungsmeldungen: bisher nur die MVG veröffentlicht einen offenen Feed. */
  meldungen: 'mvg' | null
}

/** München: Tarif geprüft (MyRadl/MVG-Rad, 1 € je 30 Min, 9 € Tageskappe,
 *  30 Freiminuten mit ÖPNV-Abo, E-Bike 1,50 € je 30 Min). */
export const MUENCHEN: Stadt & { tarif: Tarif } = {
  id: 'muenchen',
  name: 'München',
  radName: 'MyRadl',
  mitte: { lat: 48.137, lon: 11.575 },
  gbfs: 'https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_ml/de',
  systemId: 'nextbike_ml',
  provider: 'de-MyRadlMunich',
  tarif: {
    taktMin: 30,
    klassischCent: 100,
    elektroCent: 150,
    tagesdeckelCent: 900,
    freiminutenAbo: 30,
  },
  meldungen: 'mvg',
}

export const STAEDTE: Stadt[] = [
  MUENCHEN,
  {
    id: 'berlin',
    name: 'Berlin',
    radName: 'nextbike Berlin',
    mitte: { lat: 52.5087, lon: 13.3563 },
    gbfs: 'https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_bn/de',
    systemId: 'nextbike_bn',
    provider: 'de-NextbikeBerlin',
    tarif: null,
    meldungen: null,
  },
  {
    id: 'leipzig',
    name: 'Leipzig',
    radName: 'nextbike Leipzig',
    mitte: { lat: 51.3435, lon: 12.3637 },
    gbfs: 'https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_le/de',
    systemId: 'nextbike_le',
    provider: 'de-NextbikeLeipzig',
    tarif: null,
    meldungen: null,
  },
  {
    id: 'karlsruhe',
    name: 'Karlsruhe',
    radName: 'KVV.nextbike',
    mitte: { lat: 49.0102, lon: 8.41827 },
    gbfs: 'https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_fg/de',
    systemId: 'nextbike_fg',
    provider: 'de-KVV.nextbike',
    tarif: null,
    meldungen: null,
  },
]

const SCHLUESSEL = 'radl.stadt'
/** Bis hierher reicht ein Umzug: weiter weg ist es eine andere Stadt. */
const NAHE_M = 60_000

let gewaehlt: Stadt = ladeStadt()

function ladeStadt(): Stadt {
  const id = localStorage.getItem(SCHLUESSEL)
  return STAEDTE.find(s => s.id === id) ?? MUENCHEN
}

/** Die eingestellte Stadt. München bleibt der Rückfall — die App ist dafür gebaut. */
export function stadt(): Stadt {
  return gewaehlt
}

/** Hat der Nutzer die Stadt selbst gesetzt? Dann bleibt sie, auch auf Reisen. */
export function stadtGewaehlt(): boolean {
  return localStorage.getItem(SCHLUESSEL) !== null
}

export function stadtSetzen(id: string): Stadt {
  const neu = STAEDTE.find(s => s.id === id)
  if (!neu) return gewaehlt
  gewaehlt = neu
  localStorage.setItem(SCHLUESSEL, neu.id)
  return neu
}

/** Nur für Tests: gemerkte Wahl vergessen. */
export function stadtZuruecksetzen(): void {
  localStorage.removeItem(SCHLUESSEL)
  gewaehlt = MUENCHEN
}

/** Nächstgelegene eingerichtete Stadt, oder null, wenn keine in der Nähe liegt. */
export function stadtBeiPosition(p: LatLon): Stadt | null {
  let beste: Stadt | null = null
  let abstand = NAHE_M
  for (const s of STAEDTE) {
    const d = haversine(p, s.mitte)
    if (d < abstand) {
      abstand = d
      beste = s
    }
  }
  return beste
}
