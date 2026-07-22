import type { Place } from './types'

export interface SavedPlace {
  id: string
  emoji: string
  label: string
  place: Place
}

/** Предустановленные слоты — показываются только после того, как заданы. */
export const PRESET_SLOTS: { id: string; emoji: string; label: string }[] = [
  { id: 'home', emoji: '🏠', label: 'Дом' },
  { id: 'work', emoji: '💼', label: 'Работа' },
  { id: 'school', emoji: '🎓', label: 'Школа' },
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
