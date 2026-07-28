// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { laufendeMiete, mieteBeenden, mieteBeginnFuer, mieteMerken } from './miete'

const STUNDE = 60 * 60 * 1000

beforeEach(() => localStorage.clear())

describe('miete — die Ausleihe überlebt ein Neuladen', () => {
  it('gibt den Beginn zurück, den sie bekommen hat', () => {
    const t = Date.now() - 5 * 60 * 1000
    mieteMerken('S1', t)
    expect(laufendeMiete()).toEqual({ stationId: 'S1', seit: t })
  })

  it('nimmt die Uhr nur für dieselbe Station wieder auf', () => {
    const t = Date.now() - 60_000
    mieteMerken('S1', t)
    expect(mieteBeginnFuer('S1')).toBe(t)
    // Sonst liefe an einer ganz anderen Station die alte Uhr weiter.
    expect(mieteBeginnFuer('S2')).toBeNull()
    expect(mieteBeginnFuer(null)).toBeNull()
  })

  it('vergisst eine Ausleihe von vor Stunden', () => {
    const jetzt = Date.now()
    mieteMerken('S1', jetzt - 3 * STUNDE - 1000)
    // Wer vor drei Stunden ein Rad nahm, hat es längst zurückgegeben — eine
    // wiederauferstehende Uhr wäre schlimmer als gar keine.
    expect(laufendeMiete(jetzt)).toBeNull()
    mieteMerken('S1', jetzt - 2 * STUNDE)
    expect(laufendeMiete(jetzt)?.seit).toBe(jetzt - 2 * STUNDE)
  })

  it('verwirft einen Beginn in der Zukunft', () => {
    const jetzt = Date.now()
    mieteMerken('S1', jetzt + 60_000)
    expect(laufendeMiete(jetzt)).toBeNull()
  })

  it('ist nach dem Beenden weg', () => {
    mieteMerken('S1', Date.now())
    mieteBeenden()
    expect(laufendeMiete()).toBeNull()
  })

  it('verkraftet Unsinn im Speicher, statt die App mitzureißen', () => {
    for (const müll of ['', 'kein json', '{}', '[]', 'null', '{"stationId":"S1"}', '{"seit":123}', '{"stationId":"","seit":1}']) {
      localStorage.setItem('radl.miete', müll)
      expect(laufendeMiete()).toBeNull()
    }
  })
})
