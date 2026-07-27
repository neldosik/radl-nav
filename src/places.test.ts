import { beforeEach, describe, expect, it } from 'vitest'
import {
  addFavRoute,
  loadFavRoutes,
  loadSaved,
  PRESET_SLOTS,
  removeFavRoute,
  removeSaved,
  shortPlace,
  upsertSaved,
} from './places'
import type { Place } from './types'

const place = (name: string, lat = 48.1, lon = 11.5): Place => ({ name, lat, lon })

beforeEach(() => {
  localStorage.removeItem('radl.saved')
  localStorage.removeItem('radl.favroutes')
})

describe('gemerkte Orte', () => {
  it('legt einen Ort im Slot ab', () => {
    const list = upsertSaved({ id: 'home', label: 'Zuhause' }, place('Waldfriedhof'))
    expect(list).toHaveLength(1)
    expect(list[0].place.name).toBe('Waldfriedhof')
    expect(loadSaved()).toHaveLength(1)
  })

  it('überschreibt denselben Slot statt zu doppeln', () => {
    upsertSaved({ id: 'home', label: 'Zuhause' }, place('Alt'))
    const list = upsertSaved({ id: 'home', label: 'Zuhause' }, place('Neu'))
    expect(list).toHaveLength(1)
    expect(list[0].place.name).toBe('Neu')
  })

  it('hält die Presets in fester Reihenfolge, eigene Slots dahinter', () => {
    upsertSaved({ id: 'custom-1', label: 'Oma' }, place('Sendling'))
    upsertSaved({ id: 'school', label: 'Schule' }, place('LMU'))
    upsertSaved({ id: 'home', label: 'Zuhause' }, place('Waldfriedhof'))
    expect(loadSaved().map(s => s.id)).toEqual(['home', 'school', 'custom-1'])
  })

  it('löscht einen Slot und lässt die übrigen stehen', () => {
    upsertSaved({ id: 'home', label: 'Zuhause' }, place('A'))
    upsertSaved({ id: 'work', label: 'Arbeit' }, place('B'))
    const rest = removeSaved('home')
    expect(rest.map(s => s.id)).toEqual(['work'])
    expect(loadSaved()).toHaveLength(1)
  })

  it('liefert [] bei kaputtem Speicher statt zu werfen', () => {
    localStorage.setItem('radl.saved', '{kaputt')
    expect(loadSaved()).toEqual([])
  })

  it('kennt die drei Presets Zuhause/Arbeit/Schule', () => {
    expect(PRESET_SLOTS.map(s => s.id)).toEqual(['home', 'work', 'school'])
  })
})

describe('Lieblingsrouten', () => {
  it('legt neue Strecken oben ab', () => {
    addFavRoute(place('A'), place('B'))
    const list = addFavRoute(place('C'), place('D'))
    expect(list[0].from.name).toBe('C')
    expect(list).toHaveLength(2)
  })

  it('merkt dieselbe Strecke nur einmal und zieht sie nach oben', () => {
    addFavRoute(place('A'), place('B'))
    addFavRoute(place('C'), place('D'))
    const list = addFavRoute(place('A'), place('B'))
    expect(list).toHaveLength(2)
    expect(list[0].from.name).toBe('A')
  })

  it('behält höchstens acht Strecken', () => {
    for (let i = 0; i < 12; i++) addFavRoute(place(`S${i}`), place(`Z${i}`))
    expect(loadFavRoutes()).toHaveLength(8)
    expect(loadFavRoutes()[0].from.name).toBe('S11')
  })

  it('löscht eine Strecke über ihre Kennung', () => {
    const list = addFavRoute(place('A'), place('B'))
    expect(removeFavRoute(list[0].id)).toEqual([])
  })

  it('liefert [] bei kaputtem Speicher statt zu werfen', () => {
    localStorage.setItem('radl.favroutes', 'kein-json')
    expect(loadFavRoutes()).toEqual([])
  })
})

describe('shortPlace', () => {
  it('nimmt den Teil vor dem Komma', () => {
    expect(shortPlace(place('Marienplatz, München, Bayern'))).toBe('Marienplatz')
  })

  it('entfernt das alte Standort-Zeichen aus gespeicherten Orten', () => {
    expect(shortPlace(place('📍 Leonrodplatz'))).toBe('Leonrodplatz')
  })

  it('lässt einfache Namen unverändert', () => {
    expect(shortPlace(place('Olympiapark Süd'))).toBe('Olympiapark Süd')
  })
})
