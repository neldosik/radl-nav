// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SCHEMA,
  echteAdresse,
  istKartenAdresse,
  kachelpufferEinrichten,
  kachelpufferZuruecksetzen,
  kartenAnfrage,
  ladeMitPuffer,
} from './kachelpuffer'

/** Cache Storage mit dem bisschen Verhalten, das der Puffer braucht. */
function fakeCache() {
  const eintraege = new Map<string, Response>()
  const cache = {
    async match(k: string) {
      return eintraege.get(k)
    },
    async put(k: string, r: Response) {
      eintraege.set(k, r)
    },
    async delete(k: string) {
      return eintraege.delete(k)
    },
    async keys() {
      return [...eintraege.keys()]
    },
  }
  return { eintraege, holen: async () => cache as unknown as Cache }
}

function nativ(an: boolean) {
  ;(window as { Capacitor?: { isNativePlatform: () => boolean } }).Capacitor = an
    ? { isNativePlatform: () => true }
    : undefined
}

beforeEach(() => {
  kachelpufferZuruecksetzen()
  nativ(false)
  // jsdom kennt keine Cache Storage; der Puffer prüft nur ihr Vorhandensein.
  vi.stubGlobal('caches', { open: async () => fakeCache().holen() })
})

describe('istKartenAdresse', () => {
  it('erkennt Kacheln und Stile fremder Anbieter', () => {
    expect(istKartenAdresse('https://tiles.openfreemap.org/styles/liberty')).toBe(true)
    expect(istKartenAdresse('https://a.tile-cyclosm.openstreetmap.fr/cyclosm/14/1/2.png')).toBe(true)
  })

  it('lässt eigene Dateien und fremde Datenquellen in Ruhe', () => {
    expect(istKartenAdresse(`${window.location.origin}/assets/index.js`)).toBe(false)
    expect(istKartenAdresse('https://api.transitous.org/api/v1/plan')).toBe(false)
    expect(istKartenAdresse('nicht mal eine Adresse')).toBe(false)
  })
})

describe('kartenAnfrage', () => {
  it('biegt im Browser nichts um — dort puffert der Service Worker', () => {
    expect(kartenAnfrage('https://tiles.openfreemap.org/styles/liberty')).toBeUndefined()
  })

  it('setzt in der Hülle das eigene Schema davor', () => {
    nativ(true)
    const u = 'https://tiles.openfreemap.org/styles/liberty'
    expect(kartenAnfrage(u)).toEqual({ url: `${SCHEMA}://${u}` })
    expect(echteAdresse(`${SCHEMA}://${u}`)).toBe(u)
  })
})

describe('ladeMitPuffer', () => {
  it('legt Kacheln ab und liefert sie beim zweiten Mal ohne Netz', async () => {
    const { eintraege, holen } = fakeCache()
    const netz = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])))
    const url = `${SCHEMA}://https://tiles.openfreemap.org/14/1/2.pbf`

    const erst = await ladeMitPuffer(url, 'arrayBuffer', netz as unknown as typeof fetch, holen)
    expect(new Uint8Array(erst.data as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]))
    expect(eintraege.size).toBe(1)

    const zweit = await ladeMitPuffer(url, 'arrayBuffer', netz as unknown as typeof fetch, holen)
    expect(new Uint8Array(zweit.data as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]))
    expect(netz).toHaveBeenCalledTimes(1)
  })

  it('rettet den Stil aus dem Puffer, wenn das Netz weg ist', async () => {
    const { holen } = fakeCache()
    const url = 'https://tiles.openfreemap.org/styles/liberty'
    const netz = vi.fn(async () => new Response(JSON.stringify({ version: 8 })))
    await ladeMitPuffer(url, 'json', netz as unknown as typeof fetch, holen)

    const kaputt = vi.fn(async () => {
      throw new Error('offline')
    })
    const ohneNetz = await ladeMitPuffer(url, 'json', kaputt as unknown as typeof fetch, holen)
    expect(ohneNetz.data).toEqual({ version: 8 })
  })

  it('meldet den Fehler, wenn weder Netz noch Puffer etwas haben', async () => {
    const { holen } = fakeCache()
    const kaputt = vi.fn(async () => {
      throw new Error('offline')
    })
    await expect(
      ladeMitPuffer('https://tiles.openfreemap.org/14/1/2.pbf', 'arrayBuffer', kaputt as unknown as typeof fetch, holen),
    ).rejects.toThrow('offline')
  })
})

describe('kachelpufferEinrichten', () => {
  it('meldet das Schema nur in der Hülle und nur einmal an', () => {
    const anmelden = vi.fn()
    kachelpufferEinrichten(anmelden)
    expect(anmelden).not.toHaveBeenCalled()

    nativ(true)
    kachelpufferEinrichten(anmelden)
    kachelpufferEinrichten(anmelden)
    expect(anmelden).toHaveBeenCalledTimes(1)
    expect(anmelden.mock.calls[0][0]).toBe(SCHEMA)
  })
})
