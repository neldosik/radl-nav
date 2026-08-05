// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { systemTextScale, TEXT_SCALE_MODES } from './useTextScale'

/**
 * Die wichtigste Zusage dieser Änderung ist eine Nicht-Änderung: wo das Gerät
 * keine eigene Textgröße meldet — jedes Nicht-Apple-Gerät und jeder Browser
 * ohne die Textstil-Schlüsselwörter —, muss der Faktor exakt 1 sein. Sonst
 * verschöbe eine Sonde, die ins Leere greift, die ganze Oberfläche.
 *
 * jsdom kennt `-apple-system-body` nicht und ist damit genau dieser Fall.
 */
describe('systemTextScale', () => {
  it('ist ohne Systemangabe genau 1', () => {
    expect(systemTextScale()).toBe(1)
  })

  it('bleibt 1, auch wenn die Umgebung eine große Grundschrift hat', () => {
    document.documentElement.style.fontSize = '32px'
    try {
      expect(systemTextScale()).toBe(1)
    } finally {
      document.documentElement.style.fontSize = ''
    }
  })
})

describe('Stufen', () => {
  it('beginnt bei „System" — ohne eigene Wahl entscheidet das Gerät', () => {
    expect(TEXT_SCALE_MODES[0]).toBe('system')
  })

  it('schaltet im Kreis zurück auf „System"', () => {
    const naechste = (m: string) =>
      TEXT_SCALE_MODES[(TEXT_SCALE_MODES.indexOf(m as never) + 1) % TEXT_SCALE_MODES.length]
    expect(naechste('system')).toBe('large')
    expect(naechste('large')).toBe('xlarge')
    expect(naechste('xlarge')).toBe('system')
  })
})
