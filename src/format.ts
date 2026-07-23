import type { Itinerary, Leg } from './types'

export const mins = (sec: number) => Math.max(1, Math.round(sec / 60))

export const hm = (iso: string) =>
  new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

/** 1 Rad, 2 Räder */
export const bikeWord = (n: number) => (n === 1 ? 'Rad' : 'Räder')

/** Задержка транспортного этапа в минутах (>0 опоздание, <0 раньше), null если нет realtime. */
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

/** Немецкая подпись режима этапа. */
export function legLabel(leg: Leg): string {
  switch (leg.mode) {
    case 'WALK':
      return 'zu Fuß'
    case 'RENTAL':
      return (leg.rental?.systemName ?? 'MyRadl').trim()
    case 'BIKE':
      return 'Rad'
    case 'SUBWAY':
    case 'METRO':
      return 'U-Bahn'
    case 'TRAM':
      return 'Tram'
    case 'BUS':
    case 'COACH':
      return 'Bus'
    case 'SUBURBAN':
      return 'S-Bahn'
    case 'RAIL':
    case 'REGIONAL_RAIL':
    case 'REGIONAL_FAST_RAIL':
    case 'LONG_DISTANCE':
      return 'Zug'
    default:
      return leg.mode
  }
}

/** Короткий код линии для квадратного бейджа (U6, 63, S1…). */
export function lineShort(leg: Leg): string {
  if (leg.routeShortName) return leg.routeShortName
  const l = legLabel(leg)
  return l.replace(/^(U-?Bahn|S-?Bahn|Tram|Bus|Zug)\s*/i, '').trim() || '·'
}

/** Deep-link: открыть этап в Google Maps; navigate=true сразу запускает ведение. */
export function gmapsLink(leg: Leg, navigate = false): string {
  const travelmode =
    leg.mode === 'WALK' ? 'walking' : leg.mode === 'RENTAL' || leg.mode === 'BIKE' ? 'bicycling' : 'transit'
  return (
    `https://www.google.com/maps/dir/?api=1&origin=${leg.from.lat},${leg.from.lon}` +
    `&destination=${leg.to.lat},${leg.to.lon}&travelmode=${travelmode}` +
    (navigate ? '&dir_action=navigate' : '')
  )
}

/** Весь маршрут одной ссылкой — только для вариантов без транспорта. */
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
