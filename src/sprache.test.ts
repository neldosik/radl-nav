import { describe, expect, it } from 'vitest'
import { abbiegeSatz } from './sprache'

describe('abbiegeSatz — was der Ansager sagt', () => {
  it('nennt die Entfernung, solange noch Zeit zum Einordnen ist', () => {
    expect(abbiegeSatz('right', 120, 'de')).toBe('In 120 Metern rechts abbiegen')
    expect(abbiegeSatz('left', 120, 'en')).toBe('In 120 meters, turn left')
  })

  it('lässt die Entfernung weg, wenn es jetzt gilt', () => {
    expect(abbiegeSatz('right', 12, 'de')).toBe('Jetzt rechts abbiegen')
    expect(abbiegeSatz('right', 12, 'en')).toBe('Now turn right')
  })

  it('rundet auf zehn Meter — „in siebenundachtzig Metern" hilft niemandem', () => {
    expect(abbiegeSatz('left', 87, 'de')).toBe('In 90 Metern links abbiegen')
    expect(abbiegeSatz('left', 84, 'de')).toBe('In 80 Metern links abbiegen')
  })

  it('kennt alle Abbiegearten in beiden Sprachen', () => {
    const arten = ['left', 'right', 'slight-left', 'slight-right', 'sharp-left', 'sharp-right'] as const
    for (const k of arten) {
      for (const l of ['de', 'en'] as const) {
        const satz = abbiegeSatz(k, 100, l)
        expect(satz).toMatch(/\S/)
        expect(satz).not.toContain('undefined')
      }
    }
  })
})
