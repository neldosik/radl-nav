import type { Itinerary, Leg } from './types'

export const mins = (sec: number) => Math.max(1, Math.round(sec / 60))

/** 1 велик, 2 велика, 5 великов… */
export function bikeWord(n: number): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'велик'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'велика'
  return 'великов'
}

export const hm = (iso: string) =>
  new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

export interface ModeMeta {
  icon: string
  label: string
  color: string
}

export function modeMeta(leg: Leg): ModeMeta {
  const rc = leg.routeColor ? `#${leg.routeColor}` : undefined
  switch (leg.mode) {
    case 'WALK':
      return { icon: '🚶', label: 'пешком', color: '#8b93a1' }
    case 'RENTAL': {
      const scooter = (leg.rental?.formFactor ?? '').startsWith('SCOOTER')
      return scooter
        ? { icon: '🛴', label: (leg.rental?.systemName ?? 'самокат').trim(), color: '#c084fc' }
        : { icon: '🚲', label: (leg.rental?.systemName ?? 'велик').trim(), color: '#34d399' }
    }
    case 'BIKE':
      return { icon: '🚲', label: 'велик', color: '#34d399' }
    case 'SUBWAY':
    case 'METRO':
      return { icon: '🚇', label: 'U-Bahn', color: rc ?? '#3b82f6' }
    case 'TRAM':
      return { icon: '🚋', label: 'трамвай', color: rc ?? '#ef4444' }
    case 'BUS':
    case 'COACH':
      return { icon: '🚌', label: 'автобус', color: rc ?? '#0ea5e9' }
    case 'SUBURBAN':
      return { icon: '🚈', label: 'S-Bahn', color: rc ?? '#22c55e' }
    case 'RAIL':
    case 'REGIONAL_RAIL':
    case 'REGIONAL_FAST_RAIL':
    case 'LONG_DISTANCE':
      return { icon: '🚆', label: 'поезд', color: rc ?? '#a3a3a3' }
    default:
      return { icon: '🚌', label: leg.mode, color: rc ?? '#8b93a1' }
  }
}

/** Deep-link: открыть этап в Google Maps; navigate=true сразу запускает ведение (на телефоне). */
export function gmapsLink(leg: Leg, navigate = false): string {
  const travelmode =
    leg.mode === 'WALK' ? 'walking' : leg.mode === 'RENTAL' || leg.mode === 'BIKE' ? 'bicycling' : 'transit'
  return (
    `https://www.google.com/maps/dir/?api=1&origin=${leg.from.lat},${leg.from.lon}` +
    `&destination=${leg.to.lat},${leg.to.lon}&travelmode=${travelmode}` +
    (navigate ? '&dir_action=navigate' : '')
  )
}

/**
 * Весь маршрут одной ссылкой — только для вариантов без транспорта:
 * waypoints у Google не работают с travelmode=transit.
 */
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
