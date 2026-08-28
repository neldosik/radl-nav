import { describe, expect, it, vi } from 'vitest'
import { stilAbsichern } from './mapStyle'
import type * as maplibregl from 'maplibre-gl'

/** Gerade so viel Karte, wie `stilAbsichern` anfasst. */
function karte(mitEbenen = () => false) {
  const hoerer: Record<string, ((e: unknown) => void)[]> = {}
  const m = {
    on(name: string, cb: (e: unknown) => void) {
      ;(hoerer[name] ??= []).push(cb)
    },
    once(name: string, cb: (e: unknown) => void) {
      ;(hoerer[name] ??= []).push(cb)
    },
    getStyle: () => (mitEbenen() ? { layers: [{ id: 'a' }] } : { layers: [] }),
    setStyle: vi.fn(),
  }
  const fehler = (url: string) => hoerer.error?.forEach(cb => cb({ error: { url } }))
  const stildaten = () => hoerer.styledata?.forEach(cb => cb({}))
  return { m: m as unknown as maplibregl.Map, setStyle: m.setStyle, fehler, stildaten }
}

const STIL = 'https://tiles.openfreemap.org/styles/liberty'

describe('stilAbsichern', () => {
  it('fordert den Stil nach einem Fehlschlag erneut an', () => {
    vi.useFakeTimers()
    const { m, setStyle, fehler } = karte()
    stilAbsichern(m, () => STIL)

    fehler(STIL)
    expect(setStyle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(700)
    expect(setStyle).toHaveBeenCalledWith(STIL)
    vi.useRealTimers()
  })

  it('baut die eigenen Ebenen nach dem zweiten Anlauf wieder auf', () => {
    vi.useFakeTimers()
    const { m, fehler, stildaten } = karte()
    const nachStil = vi.fn()
    stilAbsichern(m, () => STIL, nachStil)

    fehler(STIL)
    vi.advanceTimersByTime(700)
    stildaten()
    expect(nachStil).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('lässt eine stehende Karte in Ruhe', () => {
    vi.useFakeTimers()
    const { m, setStyle, fehler } = karte(() => true)
    stilAbsichern(m, () => STIL)

    // Eine fehlgeschlagene Kachel darf den fertigen Stil nicht ersetzen —
    // sonst blinkt die Karte bei jedem Funkloch neu auf.
    fehler(STIL)
    fehler('https://tiles.openfreemap.org/planet/14/8/5.pbf')
    vi.advanceTimersByTime(5000)
    expect(setStyle).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('gibt nach drei Anläufen auf', () => {
    vi.useFakeTimers()
    const { m, setStyle, fehler } = karte()
    stilAbsichern(m, () => STIL)

    for (let i = 0; i < 6; i++) {
      fehler(STIL)
      vi.advanceTimersByTime(10_000)
    }
    expect(setStyle).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })
})
