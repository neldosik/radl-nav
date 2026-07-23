import type { Place } from './types'

export interface SavedPlace {
  id: string
  emoji: string
  label: string
  place: Place
}

/** Предустановленные слоты — показываются только после того, как заданы. */
export const PRESET_SLOTS: { id: string; emoji: string; label: string }[] = [
  { id: 'home', emoji: '🏠', label: 'Zuhause' },
  { id: 'work', emoji: '💼', label: 'Arbeit' },
  { id: 'school', emoji: '🎓', label: 'Uni' },
]

const KEY = 'radl.saved'

export function loadSaved(): SavedPlace[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

function persist(list: SavedPlace[]) {
  localStorage.setItem(KEY, JSON.stringify(list))
}

/** Сохранить/перезаписать место в слоте (пресетном или своём). */
export function upsertSaved(
  slot: { id: string; emoji: string; label: string },
  place: Place,
): SavedPlace[] {
  // Слоты в постоянном порядке: пресеты сверху, потом свои по времени.
  const rest = loadSaved().filter(s => s.id !== slot.id)
  const next = [...rest, { ...slot, place }]
  const order = (s: SavedPlace) => {
    const i = PRESET_SLOTS.findIndex(p => p.id === s.id)
    return i === -1 ? 100 : i
  }
  next.sort((a, b) => order(a) - order(b))
  persist(next)
  return next
}

export function removeSaved(id: string): SavedPlace[] {
  const next = loadSaved().filter(s => s.id !== id)
  persist(next)
  return next
}

// ── Любимые маршруты (пары from→to) ──
export interface FavRoute {
  id: string
  from: Place
  to: Place
}

const FR_KEY = 'radl.favroutes'

export function loadFavRoutes(): FavRoute[] {
  try {
    return JSON.parse(localStorage.getItem(FR_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function addFavRoute(from: Place, to: Place): FavRoute[] {
  const id = `${from.name}→${to.name}`
  const next = [{ id, from, to }, ...loadFavRoutes().filter(f => f.id !== id)].slice(0, 8)
  localStorage.setItem(FR_KEY, JSON.stringify(next))
  return next
}

export function removeFavRoute(id: string): FavRoute[] {
  const next = loadFavRoutes().filter(f => f.id !== id)
  localStorage.setItem(FR_KEY, JSON.stringify(next))
  return next
}

/** Короткая подпись места для чипа маршрута (первое слово / до запятой). */
export function shortPlace(p: Place): string {
  return p.name.replace(/^📍\s*/, '').split(',')[0].trim()
}
