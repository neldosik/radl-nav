import { afterEach, describe, expect, it, vi } from 'vitest'
import { STAEDTE, stadt, stadtBeiPosition, stadtGewaehlt, stadtSetzen, stadtZuruecksetzen } from './stadt'
import { freiLimitSek } from './routing'
import { legCostCentFromSec, preisBekannt, rideStats } from './stats'
import { ladeStoerungen } from './stoerungen'

afterEach(() => {
  stadtZuruecksetzen()
})

describe('Stadtwahl', () => {
  it('startet ohne gespeicherte Wahl in München', () => {
    expect(stadt().id).toBe('muenchen')
    expect(stadtGewaehlt()).toBe(false)
  })

  it('merkt sich die gewählte Stadt', () => {
    stadtSetzen('berlin')
    expect(stadt().id).toBe('berlin')
    expect(stadtGewaehlt()).toBe(true)
    expect(localStorage.getItem('radl.stadt')).toBe('berlin')
  })

  it('ignoriert unbekannte Kennungen', () => {
    stadtSetzen('paris')
    expect(stadt().id).toBe('muenchen')
  })

  it('führt für jede Stadt Feed, System und Anbieter', () => {
    for (const s of STAEDTE) {
      expect(s.gbfs).toMatch(/^https:\/\/gbfs\.nextbike\.net\//)
      expect(s.gbfs.endsWith('/')).toBe(false)
      expect(s.systemId).toMatch(/^nextbike_/)
      expect(s.provider).toMatch(/^de-/)
    }
    expect(new Set(STAEDTE.map(s => s.id)).size).toBe(STAEDTE.length)
  })

  it('findet die nächstgelegene Stadt und nur die', () => {
    expect(stadtBeiPosition({ lat: 52.52, lon: 13.4 })?.id).toBe('berlin')
    expect(stadtBeiPosition({ lat: 48.14, lon: 11.58 })?.id).toBe('muenchen')
    // Hamburg ist nicht eingerichtet — lieber keine Stadt als die falsche.
    expect(stadtBeiPosition({ lat: 53.55, lon: 9.99 })).toBeNull()
  })
})

describe('Abhängigkeiten von der Stadt', () => {
  it('rechnet nur mit hinterlegtem Tarif', () => {
    expect(preisBekannt()).toBe(true)
    expect(legCostCentFromSec(45 * 60, false, true)).toBe(100)

    stadtSetzen('leipzig')
    expect(preisBekannt()).toBe(false)
    expect(legCostCentFromSec(45 * 60, false, true)).toBe(0)
    expect(rideStats([{ minutes: 45, seconds: 2700, km: 8, electric: false }]).costKnown).toBe(false)
  })

  it('setzt die Rückgabefrist aus den Freiminuten der Stadt', () => {
    expect(freiLimitSek()).toBe(28 * 60)
    stadtSetzen('karlsruhe')
    expect(freiLimitSek()).toBe(0)
  })

  it('holt MVG-Meldungen nur in München', async () => {
    stadtSetzen('berlin')
    const spion = vi.fn()
    vi.stubGlobal('fetch', spion)
    await expect(ladeStoerungen()).resolves.toEqual([])
    expect(spion).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
