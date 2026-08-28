import { locale } from './i18n'
import type { Language } from './i18n'
import { MUENCHEN, stadt } from './stadt'
import type { ItineraryView, Leg } from './types'

/**
 * Kennzahlen einer Fahrt: Kalorien, gespartes CO₂, Leihkosten.
 *
 * Vorher lief alles über einen einzigen Faktor pro Radminute — dieselben
 * Kalorien für Pedelec und Standardrad, dieselbe Rechnung für 5 wie für
 * 40 Minuten (die Ankunftsseite rechnete sogar pauschal mit 15 Min je Etappe).
 * Hier steckt die Logik jetzt an einer Stelle und ist testbar.
 */

/** Annahme Körpergewicht, solange es keine Einstellung dafür gibt. */
export const DEFAULT_WEIGHT_KG = 75

/**
 * MET-Werte (Compendium of Physical Activities, Ainsworth et al. 2011):
 * Radfahren im Stadttempo 12–16 km/h ≈ 6.8, Pedelec-Unterstützung
 * (Langford et al. 2017, „E-bike MET") ≈ 4.9. Kalorien = MET × kg × Stunden.
 */
export const MET_CLASSIC = 6.8
export const MET_EBIKE = 4.9

/** Durchschnitts-Pkw in Deutschland: 148 g CO₂/km (UBA, Bestand 2024). */
export const CAR_CO2_PER_KM = 148
/** Herstellung/Betrieb des Leihrads — grob, aber nicht null. */
export const BIKE_CO2_PER_KM = 5

/** Preise der eingestellten Stadt — oder null, wenn der Betreiber keinen
 *  belastbaren Tarif veröffentlicht (siehe `stadt.ts`). Dann rechnet die App
 *  nicht und die Oberfläche zeigt statt einer Zahl gar nichts. */
const tarif = () => stadt().tarif

/** Münchner Tarif als benannte Werte — der Standardfall der App. */
export const CLASSIC_RATE_CENT = MUENCHEN.tarif.klassischCent
export const EBIKE_RATE_CENT = MUENCHEN.tarif.elektroCent
export const DAY_CAP_CENT = MUENCHEN.tarif.tagesdeckelCent
export const FREE_MINUTES = MUENCHEN.tarif.freiminutenAbo

/**
 * Hat der Nutzer ein ÖPNV-Abo?
 *
 * Die 30 Freiminuten hängen daran — ohne Abo gibt es keine. Bisher rechnete
 * die App sie **jedem** an: wer ohne Deutschlandticket unterwegs war, sah
 * „0 €" auf einer Fahrt, die ihn Geld kostete. Das ist keine Ungenauigkeit in
 * der Darstellung, sondern eine falsche Aussage über Geld.
 *
 * Ohne Abo wird ab der ersten Minute nach dem gleichen Satz gerechnet. Die
 * Bedingungen nennen für diesen Fall keinen eigenen Tarif; die Annahme
 * schätzt also eher zu hoch als zu niedrig — die unbedenkliche Richtung, wenn
 * eine Zahl auf dem Bildschirm eine Zusage ist.
 */
export function freiminuten(abo: boolean): number {
  return abo ? (tarif()?.freiminutenAbo ?? 0) : 0
}

/** Kennt die App den Tarif der eingestellten Stadt? */
export function preisBekannt(): boolean {
  return tarif() !== null
}

export interface RideLeg {
  /** Gerundete Minuten — für die Anzeige. */
  minutes: number
  /** Volle Sekunden — für den Preis. Die Gebührenstufe springt exakt bei
   *  30:00 Minuten; das kaufmännische Runden verschluckte bis zu 29 Sekunden
   *  und damit eine ganze Stufe. */
  seconds: number
  km: number
  electric: boolean
}

export interface RideStats {
  bikeMinutes: number
  /** Davon auf einem E-Bike — die zählen für Kalorien und Kosten anders. */
  electricMinutes: number
  bikeKm: number
  /** Verbrannte Kilokalorien — Pedelec zählt deutlich weniger. */
  kcal: number
  /** Gegenüber der gleichen Strecke mit dem Auto gespartes CO₂ in Gramm. */
  co2Grams: number
  /** Leihkosten in Cent — je nach Abo mit oder ohne Freiminuten. */
  costCent: number
  /** Falsch, wenn für die Stadt kein Tarif hinterlegt ist: `costCent` ist
   *  dann keine Aussage über Geld, sondern nur eine Null. */
  costKnown: boolean
}

/** Kalorien einer einzelnen Etappe. */
export function legKcal(minutes: number, electric: boolean, weightKg = DEFAULT_WEIGHT_KG): number {
  const met = electric ? MET_EBIKE : MET_CLASSIC
  return Math.round((met * weightKg * minutes) / 60)
}

/**
 * Leihkosten einer einzelnen Ausleihe (mit Deutschlandticket/ÖPNV-Abo).
 * Standardrad: erste 30 Minuten frei, danach 1 € je angefangene halbe Stunde.
 * E-Bike: von der ersten Minute an 1,50 € je angefangene halbe Stunde.
 */
export function legCostCent(minutes: number, electric: boolean, abo = true): number {
  return legCostCentFromSec(minutes * 60, electric, abo)
}

/** Wie `legCostCent`, aber aus Sekunden — ohne die Rundung, die eine
 *  Gebührenstufe verschlucken kann. */
export function legCostCentFromSec(seconds: number, electric: boolean, abo = true): number {
  const t = tarif()
  if (!t || seconds <= 0) return 0
  const min = seconds / 60
  if (electric) return Math.ceil(min / t.taktMin) * t.elektroCent
  const paid = Math.max(0, min - freiminuten(abo))
  return Math.ceil(paid / t.taktMin) * t.klassischCent
}

/** Summe über alle Radetappen; Kosten auf die Tageskappe begrenzt. */
export function rideStats(legs: RideLeg[], weightKg = DEFAULT_WEIGHT_KG, abo = true): RideStats {
  let bikeMinutes = 0
  let electricMinutes = 0
  let bikeKm = 0
  let kcal = 0
  let costCent = 0
  for (const l of legs) {
    bikeMinutes += l.minutes
    if (l.electric) electricMinutes += l.minutes
    bikeKm += l.km
    kcal += legKcal(l.minutes, l.electric, weightKg)
    costCent += legCostCentFromSec(l.seconds ?? l.minutes * 60, l.electric, abo)
  }
  return {
    bikeMinutes,
    electricMinutes,
    bikeKm: Math.round(bikeKm * 10) / 10,
    kcal,
    co2Grams: Math.round(bikeKm * (CAR_CO2_PER_KM - BIKE_CO2_PER_KM)),
    costCent: Math.min(costCent, tarif()?.tagesdeckelCent ?? 0),
    costKnown: preisBekannt(),
  }
}

/**
 * Radetappen einer Route auf das Rechenmodell abbilden. Die Länge kommt aus
 * MOTIS (`leg.distance`); fehlt sie, wird mit 15 km/h geschätzt.
 */
export function rideLegsOf(view: ItineraryView): RideLeg[] {
  const out: RideLeg[] = []
  for (const [i, info] of view.bikeLegs) {
    const leg: Leg | undefined = view.it.legs[i]
    if (!leg) continue
    const sec = leg.duration + info.returnDetourSec
    const meters = (leg.distance ?? (leg.duration * 15000) / 3600) + info.returnDetourM
    out.push({
      minutes: Math.round(sec / 60),
      seconds: sec,
      km: meters / 1000,
      electric: info.electric,
    })
  }
  return out
}

/** Kennzahlen direkt aus einer Route. */
export function viewStats(view: ItineraryView, weightKg = DEFAULT_WEIGHT_KG, abo = true): RideStats {
  return rideStats(rideLegsOf(view), weightKg, abo)
}

/** „1,50 €" bzw. „1.50 €" — Dezimalzeichen nach Sprache. */
export function euro(cent: number, lang: Language = 'de'): string {
  if (cent === 0) return '0 €'
  return `${(cent / 100).toLocaleString(locale(lang), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

/** „380 g" bzw. „1,2 kg". */
export function co2Label(grams: number, lang: Language = 'de'): string {
  if (grams < 1000) return `${grams} g`
  const kg = (grams / 1000).toLocaleString(locale(lang), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return `${kg} kg`
}
