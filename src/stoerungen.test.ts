import { afterEach, describe, expect, it, vi } from 'vitest'
import { alsText, ladeStoerungen, pufferLeeren, stoerungenFuerEtappen } from './stoerungen'
import type { Stoerung } from './stoerungen'
import type { Leg } from './types'

const JETZT = Date.UTC(2026, 7, 28, 12, 0, 0)

function leg(mode: string, routeShortName?: string): Leg {
  return {
    mode,
    routeShortName,
    from: { name: 'A', lat: 48.1, lon: 11.5 },
    to: { name: 'B', lat: 48.2, lon: 11.6 },
    duration: 600,
    startTime: new Date(JETZT).toISOString(),
    endTime: new Date(JETZT + 600_000).toISOString(),
  }
}

function stoerung(teil: Partial<Stoerung>): Stoerung {
  return {
    id: teil.id ?? 't',
    titel: teil.titel ?? 'Titel',
    text: teil.text ?? '',
    typ: teil.typ ?? 'incident',
    von: teil.von ?? JETZT - 3600_000,
    bis: teil.bis === undefined ? JETZT + 3600_000 : teil.bis,
    linien: teil.linien ?? [],
    link: teil.link ?? null,
  }
}

afterEach(() => {
  pufferLeeren()
  vi.unstubAllGlobals()
})

describe('alsText', () => {
  it('macht aus dem HTML der MVG lesbaren Fließtext', () => {
    const html = '<p>Zwischen <strong>Ostbahnhof</strong>&nbsp;und Leuchtenbergring</p><p>Bitte umsteigen.</p>'
    expect(alsText(html)).toBe('Zwischen Ostbahnhof und Leuchtenbergring Bitte umsteigen.')
  })

  it('löst Entitäten auf und lässt Unbekanntes stehen', () => {
    expect(alsText('S1 &amp; S8 &euro;')).toBe('S1 & S8 &euro;')
  })
})

describe('stoerungenFuerEtappen', () => {
  const legs = [leg('WALK'), leg('METRO', 'S8'), leg('SUBWAY', 'U6')]

  it('meldet nur Linien der Route', () => {
    const treffer = stoerungenFuerEtappen(
      legs,
      [
        stoerung({ id: '1', titel: 'S8 gestört', linien: [{ label: 'S8', art: 'SBAHN' }] }),
        stoerung({ id: '2', titel: 'S2 gestört', linien: [{ label: 'S2', art: 'SBAHN' }] }),
      ],
      JETZT,
    )
    expect(treffer.map(s => s.titel)).toEqual(['S8 gestört'])
  })

  it('erkennt Schienenersatz und Sammellinien', () => {
    const treffer = stoerungenFuerEtappen(
      legs,
      [
        stoerung({ id: '1', titel: 'Ersatzverkehr', linien: [{ label: 'SEV S8', art: 'SBAHN' }] }),
        stoerung({ id: '2', titel: 'Bauarbeiten', linien: [{ label: 'S6/8', art: 'SBAHN' }] }),
      ],
      JETZT,
    )
    expect(treffer).toHaveLength(2)
  })

  it('verwechselt Bus 6 nicht mit der U6', () => {
    const treffer = stoerungenFuerEtappen(
      [leg('SUBWAY', 'U6')],
      [stoerung({ titel: 'Bus 6', linien: [{ label: '6', art: 'BUS' }] })],
      JETZT,
    )
    expect(treffer).toEqual([])
  })

  it('trennt Tram und Bus mit derselben Nummer', () => {
    const alle = [stoerung({ titel: 'Tram 25', linien: [{ label: '25', art: 'TRAM' }] })]
    expect(stoerungenFuerEtappen([leg('TRAM', '25')], alle, JETZT)).toHaveLength(1)
    expect(stoerungenFuerEtappen([leg('BUS', '25')], alle, JETZT)).toEqual([])
  })

  it('lässt abgelaufene und künftige Meldungen weg', () => {
    const treffer = stoerungenFuerEtappen(
      legs,
      [
        stoerung({ id: 'alt', titel: 'vorbei', bis: JETZT - 1, linien: [{ label: 'S8', art: 'SBAHN' }] }),
        stoerung({ id: 'neu', titel: 'später', von: JETZT + 1, linien: [{ label: 'S8', art: 'SBAHN' }] }),
        stoerung({ id: 'offen', titel: 'Dauerbaustelle', bis: null, linien: [{ label: 'S8', art: 'SBAHN' }] }),
      ],
      JETZT,
    )
    expect(treffer.map(s => s.titel)).toEqual(['Dauerbaustelle'])
  })

  it('zeigt dieselbe Meldung nur einmal und Störungen vor Fahrplanänderungen', () => {
    const treffer = stoerungenFuerEtappen(
      legs,
      [
        stoerung({ id: 'a', titel: 'Baustelle', typ: 'plan', linien: [{ label: 'S8', art: 'SBAHN' }] }),
        stoerung({ id: 'b', titel: 'Baustelle', typ: 'plan', linien: [{ label: 'S8', art: 'SBAHN' }] }),
        stoerung({ id: 'c', titel: 'Signalstörung', typ: 'incident', linien: [{ label: 'U6', art: 'UBAHN' }] }),
      ],
      JETZT,
    )
    expect(treffer.map(s => s.titel)).toEqual(['Signalstörung', 'Baustelle'])
  })
})

describe('ladeStoerungen', () => {
  const rohMeldung = {
    title: 'S8: Signalstörung',
    description: '<p>Es kommt zu <b>Verspätungen</b>.</p>',
    type: 'INCIDENT',
    validFrom: JETZT - 1000,
    validTo: JETZT + 1000,
    lines: [{ label: 'S8', transportType: 'SBAHN' }],
    links: [{ text: 'Mehr', url: 'https://www.mvg.de/meldung' }],
  }

  it('wandelt die MVG-Antwort um', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([rohMeldung]))))
    const [s] = await ladeStoerungen()
    expect(s).toMatchObject({
      titel: 'S8: Signalstörung',
      text: 'Es kommt zu Verspätungen.',
      typ: 'incident',
      linien: [{ label: 'S8', art: 'SBAHN' }],
      link: 'https://www.mvg.de/meldung',
    })
  })

  it('fragt nicht zweimal hintereinander', async () => {
    const abruf = vi.fn(async () => new Response(JSON.stringify([rohMeldung])))
    vi.stubGlobal('fetch', abruf)
    await ladeStoerungen()
    await ladeStoerungen()
    expect(abruf).toHaveBeenCalledTimes(1)
  })

  it('liefert bei Netzfehler eine leere Liste', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(ladeStoerungen()).resolves.toEqual([])
  })

  it('verschluckt sich nicht an einer fremden Antwort', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"fehler":true}')))
    await expect(ladeStoerungen()).resolves.toEqual([])
  })
})
