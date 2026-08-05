// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { ladeThemeWahl, systemTheme, THEME_CHOICES } from './useTheme'

/** `matchMedia` gibt es in jsdom nicht — hier eine Fassung, die antwortet. */
function geraetSagt(dunkel: boolean) {
  window.matchMedia = ((abfrage: string) => ({
    matches: abfrage.includes('dark') ? dunkel : false,
    media: abfrage,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  localStorage.clear()
  // @ts-expect-error — für den Fall „Gerät sagt nichts"
  delete window.matchMedia
})

describe('systemTheme', () => {
  it('folgt dem Gerät', () => {
    geraetSagt(true)
    expect(systemTheme()).toBe('dark')
    geraetSagt(false)
    expect(systemTheme()).toBe('light')
  })

  it('ist hell, wo das Gerät nichts sagt', () => {
    expect(systemTheme()).toBe('light')
  })
})

describe('ladeThemeWahl', () => {
  it('beginnt bei „System" — ohne eigene Wahl entscheidet das Gerät', () => {
    expect(ladeThemeWahl()).toBe('system')
    expect(THEME_CHOICES[0]).toBe('system')
  })

  it('hält eine eigene Wahl fest — auch „hell" auf einem dunklen Gerät', () => {
    // Der Fall, an dem eine zweiwertige Fassung scheitert: „hell" wäre dort
    // zugleich der Rückfall und ließe sich nach einem Neustart nicht mehr von
    // „nie gewählt" unterscheiden.
    localStorage.setItem('radl.theme.mode', 'light')
    geraetSagt(true)
    expect(ladeThemeWahl()).toBe('light')
  })

  it('übernimmt ein altes „dark" — das kann nur bewusst gesetzt worden sein', () => {
    localStorage.setItem('radl.theme', 'dark')
    expect(ladeThemeWahl()).toBe('dark')
  })

  it('liest ein altes „light" als „nie gewählt"', () => {
    // Der alte Stand schrieb bei jedem Start „light", auch ungefragt. Würde
    // das als Wahl gelten, käme niemand je in den Systemmodus.
    localStorage.setItem('radl.theme', 'light')
    expect(ladeThemeWahl()).toBe('system')
  })

  it('lässt den neuen Schlüssel den alten überstimmen', () => {
    localStorage.setItem('radl.theme', 'dark')
    localStorage.setItem('radl.theme.mode', 'system')
    expect(ladeThemeWahl()).toBe('system')
  })

  it('schaltet im Kreis zurück auf „System"', () => {
    const naechste = (c: string) =>
      THEME_CHOICES[(THEME_CHOICES.indexOf(c as never) + 1) % THEME_CHOICES.length]
    expect(naechste('system')).toBe('light')
    expect(naechste('light')).toBe('dark')
    expect(naechste('dark')).toBe('system')
  })
})
