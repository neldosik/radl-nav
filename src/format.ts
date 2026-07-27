import { t } from './i18n'
import type { Language } from './i18n'
import type { Itinerary, Leg } from './types'

export const mins = (sec: number) => Math.max(1, Math.round(sec / 60))

export const hm = (iso: string) =>
  new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

/** 1 Rad, 2 Räder — bzw. 1 bike, 2 bikes. */
export const bikeWord = (n: number, lang: Language = 'de') =>
  t(n === 1 ? 'bikeOne' : 'bikeMany', lang)

/** Verzögerung der Etappe in Minuten (>0 Verspätung, <0 verfrüht), null falls keine Echtzeitdaten. */
export function legDelayMin(leg: Leg): number | null {
  if (!leg.realTime || !leg.scheduledStartTime || !leg.startTime) return null
  const d = (new Date(leg.startTime).getTime() - new Date(leg.scheduledStartTime).getTime()) / 60000
  return Math.round(d)
}

export type LegKind = 'walk' | 'bike' | 'line'

export function legKind(leg: Leg): LegKind {
  if (leg.mode === 'WALK') return 'walk'
  if (leg.mode === 'RENTAL' || leg.mode === 'BIKE') return 'bike'
  return 'line'
}

/**
 * Bezeichnung des Etappenmodus in der gewählten Sprache. Die Namen standen
 * früher fest im Code und blieben beim Umschalten auf Englisch deutsch.
 * Der Name des Verleihsystems kommt aus den Daten und wird nicht übersetzt.
 */
export function legLabel(leg: Leg, lang: Language = 'de'): string {
  switch (leg.mode) {
    case 'WALK':
      return t('modeWalk', lang)
    case 'RENTAL':
      return (leg.rental?.systemName ?? 'MyRadl').trim()
    case 'BIKE':
      return t('modeBike', lang)
    case 'SUBWAY':
    case 'METRO':
      return t('modeSubway', lang)
    case 'TRAM':
      return t('modeTram', lang)
    case 'BUS':
    case 'COACH':
      return t('modeBus', lang)
    case 'SUBURBAN':
      return t('modeSuburban', lang)
    case 'RAIL':
    case 'REGIONAL_RAIL':
    case 'REGIONAL_FAST_RAIL':
    case 'LONG_DISTANCE':
      return t('modeTrain', lang)
    default:
      return leg.mode
  }
}

/** Kurzer Linien-Code für quadratisches Badge (U6, 63, S1…). */
export function lineShort(leg: Leg, lang: Language = 'de'): string {
  if (leg.routeShortName) return leg.routeShortName
  const l = legLabel(leg, lang)
  return l.replace(/^(U-?Bahn|S-?Bahn|Tram|Bus|Zug|Subway|Train)\s*/i, '').trim() || '·'
}

/** Deep-Link: Etappe in Google Maps öffnen; navigate=true startet direkt die Navigation. */
export function gmapsLink(leg: Leg, navigate = false): string {
  const travelmode =
    leg.mode === 'WALK' ? 'walking' : leg.mode === 'RENTAL' || leg.mode === 'BIKE' ? 'bicycling' : 'transit'
  return (
    `https://www.google.com/maps/dir/?api=1&origin=${leg.from.lat},${leg.from.lon}` +
    `&destination=${leg.to.lat},${leg.to.lon}&travelmode=${travelmode}` +
    (navigate ? '&dir_action=navigate' : '')
  )
}

/** Gesamte Route in einem Link — nur für reine Rad-/Fußwegvarianten. */
export function gmapsFullBikeLink(it: Itinerary): string | null {
  if (!it.legs.every(l => l.mode === 'WALK' || l.mode === 'RENTAL' || l.mode === 'BIKE')) return null
  const first = it.legs[0]
  const last = it.legs[it.legs.length - 1]
  const way = it.legs
    .slice(0, -1)
    .map(l => `${l.to.lat},${l.to.lon}`)
    .join('|')
  return (
    `https://www.google.com/maps/dir/?api=1&origin=${first.from.lat},${first.from.lon}` +
    `&destination=${last.to.lat},${last.to.lon}` +
    (way ? `&waypoints=${encodeURIComponent(way)}` : '') +
    `&travelmode=bicycling`
  )
}

/** Ausweichziel aus dem GBFS-Feed von MyRadl (`rental_apps.android.discovery_uri`):
 *  öffnet die App, sonst die Webseite. Das früher gebaute
 *  `nextbike.de/bm/location/?lat=…` gibt es nicht — das lief auf eine 404. */
const NEXTBIKE_APP = 'https://app.nextbike.net/'

/** Je Plattform den passenden Mietlink — der Android-Link taugt auf dem iPhone nicht. */
export function pickRentalUri(
  uris: { android?: string; ios?: string; web?: string } | undefined,
  ua = navigator.userAgent,
): string {
  if (/iPhone|iPad|iPod/i.test(ua) && uris?.ios) return uris.ios
  if (/Android/i.test(ua) && uris?.android) return uris.android
  return uris?.web ?? NEXTBIKE_APP
}

/** Deep-Link in die Nextbike-App oder Nextbike-Webseite zur Ausleihe/Reservierung. */
export function nextbikeLink(leg: Leg, ua = navigator.userAgent): string {
  const r = leg.rental
  return pickRentalUri({ android: r?.rentalUriAndroid, ios: r?.rentalUriIOS, web: r?.rentalUriWeb }, ua)
}
