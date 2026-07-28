import { describe, expect, it } from 'vitest'
import { ausduennen, punktAnhaengen } from './track'
import { distanceToPath } from './geo'

const P = (lat: number, lon: number) => ({ lat, lon })

describe('punktAnhaengen', () => {
  it('nimmt den ersten Punkt immer', () => {
    expect(punktAnhaengen([], P(48.14, 11.58))).toHaveLength(1)
  })
  it('verwirft Rauschen im Stand', () => {
    // Ohne das zieht eine Pause an der Ampel Meter auf die Strecke.
    const s = [P(48.14, 11.58)]
    expect(punktAnhaengen(s, P(48.14002, 11.58))).toBe(s)
  })
  it('nimmt echte Bewegung auf', () => {
    const s = [P(48.14, 11.58)]
    expect(punktAnhaengen(s, P(48.1404, 11.58))).toHaveLength(2)
  })
})

describe('ausduennen', () => {
  it('lässt Anfang und Ende stehen', () => {
    const spur = Array.from({ length: 50 }, (_, i) => P(48.14 + i * 0.0001, 11.58))
    const d = ausduennen(spur)
    expect(d[0]).toEqual(spur[0])
    expect(d[d.length - 1]).toEqual(spur[spur.length - 1])
  })
  it('macht aus einer Geraden zwei Punkte', () => {
    const spur = Array.from({ length: 50 }, (_, i) => P(48.14 + i * 0.0001, 11.58))
    expect(ausduennen(spur)).toHaveLength(2)
  })
  it('behält eine Ecke', () => {
    const spur = [P(48.14, 11.58), P(48.145, 11.58), P(48.145, 11.59)]
    expect(ausduennen(spur)).toHaveLength(3)
  })
  it('weicht nirgends weiter ab als die Toleranz', () => {
    const spur = Array.from({ length: 200 }, (_, i) => P(48.14 + i * 0.0001, 11.58 + Math.sin(i / 9) * 0.0004))
    const d = ausduennen(spur, 10)
    expect(d.length).toBeLessThan(spur.length / 2)
    // Gemessen zur ausgedünnten **Linie**, nicht zur nächsten Ecke: das
    // Verfahren verspricht Nähe zum Streckenzug, ein Punkt darf ohne Weiteres
    // eine halbe Segmentlänge von jeder Ecke entfernt liegen.
    for (const p of spur) {
      expect(distanceToPath(d, p) ?? 0).toBeLessThanOrEqual(10.5)
    }
  })
  it('verkraftet kurze Spuren', () => {
    expect(ausduennen([])).toEqual([])
    expect(ausduennen([P(48.14, 11.58)])).toHaveLength(1)
  })
})
