import { describe, expect, it } from 'vitest'
import { brauchtPaket } from './aktualisierung'

/**
 * Geprüft wird nur die Entscheidung. Der Rest von `aktualisierung.ts` sind
 * Aufrufe in die native Hülle, die sich am Schreibtisch nicht ausführen
 * lassen — deshalb steht die Regel als eigene Funktion daneben.
 */

const stand = { version: '1.0.42', url: 'https://example.org/b/1.0.42.zip' }

describe('brauchtPaket', () => {
  it('lädt, wenn der Server einen anderen Stand nennt', () => {
    expect(brauchtPaket(stand, '1.0.41')).toBe('geladen')
  })

  it('lädt nichts, wenn schon derselbe Stand läuft', () => {
    expect(brauchtPaket(stand, '1.0.42')).toBe('aktuell')
  })

  it('lädt nichts doppelt, wenn das Paket auf den Neustart wartet', () => {
    // Ohne diese Prüfung liefe bei jeder Rückkehr zur App derselbe Download
    // erneut — stündlich, über Mobilfunk, für nichts.
    const bereit = [{ version: '1.0.42', status: 'success' }]
    expect(brauchtPaket(stand, '1.0.41', bereit)).toBe('liegt-bereit')
  })

  it('lädt erneut, wenn das liegende Paket kaputt ist', () => {
    const kaputt = [{ version: '1.0.42', status: 'error' }]
    expect(brauchtPaket(stand, '1.0.41', kaputt)).toBe('geladen')
  })

  it('lädt erneut, wenn das liegende Paket schon gelöscht wurde', () => {
    const weg = [{ version: '1.0.42', status: 'deleted' }]
    expect(brauchtPaket(stand, '1.0.41', weg)).toBe('geladen')
  })

  it('hält ein unbrauchbares Manifest für einen Fehler, nicht für neu', () => {
    // Eine leere oder halbe Antwort darf keinen Download auslösen — sonst
    // reicht eine falsch ausgelieferte Datei, um jedes Gerät loszuschicken.
    expect(brauchtPaket(null, '1.0.41')).toBe('fehler')
    expect(brauchtPaket({ version: '', url: 'https://x/y.zip' }, '1.0.41')).toBe('fehler')
    expect(brauchtPaket({ version: '1.0.43', url: '' }, '1.0.41')).toBe('fehler')
  })

  it('lädt, wenn der laufende Stand unbekannt ist', () => {
    expect(brauchtPaket(stand, undefined)).toBe('geladen')
  })
})
