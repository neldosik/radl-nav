import { describe, expect, it } from 'vitest'
import { dict, t } from './i18n'
import type { Language } from './i18n'

/**
 * Wächter über die Wörterbücher.
 *
 * Der eigentliche Fehler war nie eine falsche Übersetzung, sondern ein
 * Schlüssel, den nur eine der beiden Sprachen kannte — beim Umschalten stand
 * dann deutscher Text mitten im englischen Bildschirm. Das sieht man nur, wenn
 * man genau diesen Bildschirm auf Englisch aufruft. Diese Tests sehen es immer.
 */

const SPRACHEN: Language[] = ['de', 'en']

describe('Wörterbücher', () => {
  it('kennen in beiden Sprachen dieselben Schlüssel', () => {
    const de = Object.keys(dict.de).sort()
    const en = Object.keys(dict.en).sort()
    const nurDe = de.filter(k => !en.includes(k))
    const nurEn = en.filter(k => !de.includes(k))
    expect({ nurDe, nurEn }).toEqual({ nurDe: [], nurEn: [] })
  })

  it('haben je Schlüssel denselben Typ', () => {
    for (const key of Object.keys(dict.de) as (keyof typeof dict.de)[]) {
      expect(typeof dict.en[key], `Schlüssel ${key}`).toBe(typeof dict.de[key])
    }
  })

  it('erwarten je Schlüssel gleich viele Werte', () => {
    for (const key of Object.keys(dict.de) as (keyof typeof dict.de)[]) {
      const d = dict.de[key]
      const e = dict.en[key]
      if (typeof d === 'function' && typeof e === 'function') {
        expect(e.length, `Schlüssel ${key}`).toBe(d.length)
      }
    }
  })

  it('lassen keinen Text leer', () => {
    for (const lang of SPRACHEN) {
      for (const [key, wert] of Object.entries(dict[lang])) {
        if (typeof wert === 'string') {
          expect(wert.trim(), `${lang}.${key}`).not.toBe('')
        }
      }
    }
  })

  it('übersetzen die Verkehrsmittel wirklich, statt deutsch zu bleiben', () => {
    // „S-Bahn" ist auch im Englischen der gebräuchliche Name und bleibt.
    expect(dict.en.modeWalk).not.toBe(dict.de.modeWalk)
    expect(dict.en.modeSubway).not.toBe(dict.de.modeSubway)
    expect(dict.en.modeTrain).not.toBe(dict.de.modeTrain)
  })

  it('übersetzt „Schule" im Englischen — stand dort früher deutsch', () => {
    expect(dict.en.uni).toBe('School')
  })
})

describe('t', () => {
  it('liefert die Sprache, nach der gefragt wurde', () => {
    expect(t('tabBikes', 'de')).toBe('Räder')
    expect(t('tabBikes', 'en')).toBe('Bikes')
  })

  it('fällt bei unbekannter Sprache auf Deutsch zurück', () => {
    expect(t('tabBikes', 'xx' as Language)).toBe('Räder')
  })
})

describe('Texte mit Zahlen', () => {
  it('setzen Werte in beiden Sprachen ein', () => {
    expect(dict.de.cardDepartIn(5)).toContain('5')
    expect(dict.en.cardDepartIn(5)).toContain('5')
    expect(dict.de.bmSummary(12, 3)).toContain('12')
    expect(dict.en.bmSummary(12, 3)).toContain('12')
  })

  it('stellen dem Plus bei Verspätung ein Vorzeichen voran, bei Verfrühung nicht', () => {
    expect(dict.de.cardDelay(3)).toBe('+3 Min')
    expect(dict.de.cardDelay(-2)).toBe('-2 Min')
    expect(dict.en.cardDelay(3)).toBe('+3 min')
  })

  it('lassen die Entfernung weg, wenn sie nicht angegeben ist', () => {
    expect(dict.de.cardPickupAt(2, 'Marienplatz', null)).toBe('2 an »Marienplatz«')
    expect(dict.de.cardPickupAt(2, 'Marienplatz', 180)).toContain('180 m')
  })
})
