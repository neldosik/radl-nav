import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { standAusParams, suchParams, suchUrl, teilen } from './verweis'
import type { SuchStand } from './verweis'

const marienplatz = { name: 'Marienplatz', lat: 48.1374, lon: 11.5755 }
const ostbahnhof = { name: 'Ostbahnhof', lat: 48.1272, lon: 11.6045 }

const stand: SuchStand = {
  from: marienplatz,
  to: ostbahnhof,
  timeMode: 'now',
  timeVal: '',
  maxBike: 30,
  bikeType: 'classic',
  bikes: 1,
}

describe('suchParams', () => {
  it('schreibt nur Orte, wenn alles andere Standard ist', () => {
    expect(suchParams(stand).toString()).toBe(
      new URLSearchParams({
        von: '48.13740,11.57550,Marienplatz',
        nach: '48.12720,11.60450,Ostbahnhof',
      }).toString(),
    )
  })

  it('nimmt Zeit nur mit Modus und gültigem Wert auf', () => {
    expect(suchParams({ ...stand, timeMode: 'arrive', timeVal: 'morgen' }).has('zeit')).toBe(false)
    const p = suchParams({ ...stand, timeMode: 'arrive', timeVal: '2026-09-01T08:30' })
    expect(p.get('modus')).toBe('arrive')
    expect(p.get('zeit')).toBe('2026-09-01T08:30')
  })

  it('schreibt abweichende Filter', () => {
    const p = suchParams({ ...stand, bikeType: 'any', maxBike: 15, bikes: 3 })
    expect(p.get('rad')).toBe('any')
    expect(p.get('max')).toBe('15')
    expect(p.get('n')).toBe('3')
  })
})

describe('standAusParams', () => {
  it('liest zurück, was geschrieben wurde', () => {
    const voll: SuchStand = {
      ...stand,
      timeMode: 'depart',
      timeVal: '2026-09-01T08:30',
      bikeType: 'any',
      maxBike: 10,
      bikes: 2,
    }
    expect(standAusParams(suchParams(voll))).toEqual(voll)
  })

  it('lässt Kommas im Namen zu', () => {
    const ort = { name: 'Bäckerei, Ecke Sonnenstraße', lat: 48.1, lon: 11.5 }
    const zurueck = standAusParams(suchParams({ ...stand, from: ort }))
    expect(zurueck.from).toEqual({ ...ort, lat: 48.1, lon: 11.5 })
  })

  it('verwirft unsinnige Koordinaten statt zu raten', () => {
    expect(standAusParams(new URLSearchParams({ von: '999,11.5,Nirgendwo' })).from).toBeUndefined()
    expect(standAusParams(new URLSearchParams({ von: 'Marienplatz' })).from).toBeUndefined()
  })

  it('verwirft Filterwerte außerhalb der Auswahl', () => {
    const p = new URLSearchParams({ max: '7', n: '99', rad: 'roller' })
    expect(standAusParams(p)).toEqual({})
  })

  it('setzt einen Ersatznamen, wenn nur Koordinaten kommen', () => {
    expect(standAusParams(new URLSearchParams({ von: '48.1374,11.5755' })).from).toEqual({
      lat: 48.1374,
      lon: 11.5755,
      name: '48.1374, 11.5755',
    })
  })
})

describe('suchUrl', () => {
  it('ersetzt Abfrageteil und Anker der Grundadresse', () => {
    expect(suchUrl(stand, 'https://neldosik.github.io/radl-nav/?alt=1#weg')).toBe(
      'https://neldosik.github.io/radl-nav/?von=48.13740%2C11.57550%2CMarienplatz&nach=48.12720%2C11.60450%2COstbahnhof',
    )
  })
})

describe('teilen', () => {
  const url = 'https://neldosik.github.io/radl-nav/?von=1,2,A'

  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    })
  })
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'share')
  })

  it('nutzt den Systemdialog, wenn es ihn gibt', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    await expect(teilen(url, 'Route')).resolves.toBe('geteilt')
    expect(share).toHaveBeenCalledWith({ title: 'Route', url })
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
  })

  it('wertet den Abbruch des Dialogs nicht als Fehler', async () => {
    const abbruch = Object.assign(new Error('abgebrochen'), { name: 'AbortError' })
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockRejectedValue(abbruch),
      configurable: true,
    })
    await expect(teilen(url, 'Route')).resolves.toBe('geteilt')
  })

  it('kopiert, wenn der Systemdialog fehlt', async () => {
    await expect(teilen(url, 'Route')).resolves.toBe('kopiert')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(url)
  })

  it('meldet einen Fehler, wenn auch das Kopieren scheitert', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('kein Zugriff')) },
      configurable: true,
    })
    await expect(teilen(url, 'Route')).resolves.toBe('fehler')
  })
})
